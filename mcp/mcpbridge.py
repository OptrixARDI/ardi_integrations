#!/usr/bin/env python3
"""
MCPBridge - Bridges MCP clients to internal HTTP services via MQTT.

Usage:
  python mcpbridge.py server --config config.json
  python mcpbridge.py client --config config.json
"""

import argparse
import asyncio
import inspect
import json
import logging
import sys
import threading
import uuid
from typing import Any

import paho.mqtt.client as mqtt
import requests
from mcp.server.fastmcp import FastMCP
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def load_config(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


# ─── MQTT CONNECTION ──────────────────────────────────────────────────────────

class MQTTConnection:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.base_topic = cfg["base_topic"].rstrip("/")
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self._topic_callbacks: dict[str, Any] = {}
        self._connected = threading.Event()

        if cfg.get("username"):
            self.client.username_pw_set(cfg["username"], cfg.get("password", ""))
        if cfg.get("tls"):
            self.client.tls_set()

        self.client.on_connect = self._on_connect
        self.client.on_message = self._dispatch_message

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            log.info("Connected to MQTT broker")
            self._connected.set()
        else:
            log.error(f"MQTT connection failed: {reason_code}")

    def _dispatch_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = msg.payload.decode(errors="replace")

        for sub_topic, callback in list(self._topic_callbacks.items()):
            if mqtt.topic_matches_sub(sub_topic, msg.topic):
                try:
                    callback(msg.topic, payload)
                except Exception as e:
                    log.error(f"Callback error for {msg.topic}: {e}")
                return

    def connect(self):
        host = self.cfg["host"]
        port = self.cfg.get("port", 1883)
        keepalive = self.cfg.get("keepalive", 60)
        self.client.connect(host, port, keepalive)
        self.client.loop_start()
        if not self._connected.wait(timeout=10):
            raise RuntimeError(f"Timed out connecting to MQTT broker at {host}:{port}")

    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()

    def publish(self, topic: str, payload: Any, retain: bool = False, qos: int = 1):
        msg = json.dumps(payload) if not isinstance(payload, str) else payload
        self.client.publish(topic, msg, qos=qos, retain=retain)

    def subscribe(self, topic: str, callback, qos: int = 1):
        self._topic_callbacks[topic] = callback
        self.client.subscribe(topic, qos=qos)


# ─── SERVER MODE ─────────────────────────────────────────────────────────────

def run_server(config: dict):
    mqtt_cfg = config["mqtt"]
    tools = []
    server = config["server"]

    #Compile the list of tools from the ARDI server.
    toollist = requests.get(server+"/mcp/dynamic").json()['tools']
    finaltools = []
    for t in toollist:
        tx = {}
        tx['name'] = t['name']
        tx['description'] = t['desc']
        tx['parameters'] = []
        for p in t['parameters']:
            px = {}
            px['name'] = p['name']
            px['description'] = p['detail']
            px['type'] = p['type']
            px['required'] = True
            tx['parameters'].append(px)

        finaltools.append(tx)

    tools = finaltools        

    conn = MQTTConnection(mqtt_cfg)
    conn.connect()

    base = conn.base_topic
    tool_map = {t["name"]: t for t in tools}

    # Publish tool manifest as a retained message so clients pick it up immediately
    manifest = finaltools

    conn.publish(f"{base}/manifest", manifest, retain=True)
    log.info(f"Published manifest with {len(tools)} tool(s) to {base}/manifest")

    #A new request has come in from MQTT, call the URL.
    def on_request(topic: str, payload: dict):
        request_id = payload.get("request_id")
        tool_name = payload.get("tool_name")
        params = payload.get("parameters", {})

        log.info(f"Request [{request_id}]: {tool_name}({params})")

        #Find the appropriate tool
        tool_def = tool_map.get(tool_name)
        if tool_def is None:
            result = {
                "request_id": request_id,
                "success": False,
                "error": f"Unknown tool: {tool_name}",
            }
        else:
            try:
                url = config['server'] + "/mcp/" + tool_name
                method = tool_def.get("method", "GET").upper()
                timeout = tool_def.get("timeout", 30)

                #Filter the parameters
                allowed_keys = {p["name"] for p in tool_def.get("parameters", [])}
                safe_params = {k: v for k, v in params.items() if k in allowed_keys}

                if method == "GET":
                    resp = requests.get(url, params=safe_params, timeout=timeout)
                elif method == "POST":
                    resp = requests.post(url, json=safe_params, timeout=timeout)
                else:
                    resp = requests.request(method, url, params=safe_params, timeout=timeout)

                resp.raise_for_status()
                try:
                    body = resp.json()
                except Exception:
                    body = resp.text

                #Return the result
                result = {"request_id": request_id, "success": True, "result": body}
                log.info(f"Response [{request_id}]: HTTP {resp.status_code}")
            except Exception as e:
                log.error(f"Error calling {tool_name}: {e}")
                result = {"request_id": request_id, "success": False, "error": str(e)}

        #Publish the result back to MQTT
        conn.publish(f"{base}/response/{request_id}", result)

    #Listen in on MQTT for incoming requests
    conn.subscribe(f"{base}/request/+", on_request)
    log.info(f"Server listening on {base}/request/+")

    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        log.info("Server shutting down")
        conn.disconnect()


# ─── CLIENT MODE ─────────────────────────────────────────────────────────────

class MCPBridgeClient:
    def __init__(self, config: dict):
        self.config = config
        self.conn = MQTTConnection(config["mqtt"])
        self.base = self.conn.base_topic
        self._pending: dict[str, asyncio.Future] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    #Connect to MQTT
    def connect(self):
        self.conn.connect()
        self.conn.subscribe(f"{self.base}/response/+", self._on_response)

    #Got a response from the server
    def _on_response(self, topic: str, payload: dict):
        request_id = payload.get("request_id")
        if request_id and request_id in self._pending and self._loop:
            future = self._pending.pop(request_id)
            self._loop.call_soon_threadsafe(future.set_result, payload)

    #Send a tool call to MQTT
    async def call_tool(self, tool_name: str, params: dict) -> str:
        self._loop = asyncio.get_running_loop()

        request_id = str(uuid.uuid4())
        future: asyncio.Future = self._loop.create_future()
        self._pending[request_id] = future

        self.conn.publish(
            f"{self.base}/request/{request_id}",
            {"request_id": request_id, "tool_name": tool_name, "parameters": params},
        )

        timeout = self.config.get("request_timeout", 30)
        try:
            result = await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            self._pending.pop(request_id, None)
            raise RuntimeError(f"Tool '{tool_name}' timed out after {timeout}s")

        if not result.get("success"):
            raise RuntimeError(result.get("error", "Unknown error from server"))

        r = result["result"]
        return json.dumps(r) if not isinstance(r, str) else r


def _make_tool_handler(tool_name: str, bridge: MCPBridgeClient):
    async def handler(**kwargs):
        return await bridge.call_tool(tool_name, kwargs)

    return handler


_TYPE_MAP = {
    "string": str,
    "integer": int,
    "number": float,
    "boolean": bool,
    "object": dict,
    "array": list,
}

# Convert the manifest into an proper MCP toolset
def build_mcp_from_manifest(manifest: list, bridge: MCPBridgeClient) -> FastMCP:
    mcp = FastMCP("MCPBridge")

    for tool_def in manifest:
        params = []
        annotations: dict = {}

        for p in tool_def.get("parameters", []):
            ann = _TYPE_MAP.get(p.get("type", "string"), str)
            annotations[p["name"]] = ann
            default = inspect.Parameter.empty if p.get("required", True) else None
            params.append(
                inspect.Parameter(
                    p["name"],
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    default=default,
                    annotation=ann,
                )
            )
        annotations["return"] = str

        handler = _make_tool_handler(tool_def["name"], bridge)
        handler.__name__ = tool_def["name"]
        handler.__doc__ = tool_def["description"]
        handler.__signature__ = inspect.Signature(params)
        handler.__annotations__ = annotations

        mcp.tool()(handler)
        log.info(f"Registered tool: {tool_def['name']}")

    return mcp

#Create a client (Internet-side) connection, exposing an MCP interface
def run_client(config: dict, stdio: bool = False):
    bridge = MCPBridgeClient(config)
    bridge.connect()

    base = bridge.base
    manifest_event = threading.Event()
    manifest_data: list = []

    def on_manifest(topic: str, payload):
        if isinstance(payload, list):
            manifest_data.clear()
            manifest_data.extend(payload)
            manifest_event.set()

    # Retained message will arrive immediately after subscribe
    bridge.conn.subscribe(f"{base}/manifest", on_manifest)

    if not manifest_event.wait(timeout=10):
        log.error("Timed out waiting for tool manifest — is the server running?")
        sys.exit(1)

    log.info(f"Received manifest with {len(manifest_data)} tool(s)")

    #Here's where some security/token validation might go.

    mcp = build_mcp_from_manifest(manifest_data, bridge)

    if stdio == True:
        mcp.run()
    else:
        app = mcp.streamable_http_app()

        
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],  # Allows all origins
            allow_credentials=True,
            allow_methods=["*"],  # Allows all methods (GET, POST, etc.)
            allow_headers=["*"],  # Allows all headers
            expose_headers=["mcp-session-id"]
        )
    
        return app


# ─── ENTRY POINT ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="MCPBridge: MCP↔MQTT↔HTTP bridge")
    parser.add_argument("mode", choices=["server", "client"], help="Run mode")
    parser.add_argument("--config", default="config.json", help="Path to config file")
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )
    args = parser.parse_args()

    logging.getLogger().setLevel(args.log_level)

    config = load_config(args.config)

    if args.mode == "server":
        run_server(config)
    else:
        run_client(config,True)


if __name__ == "__main__":
    main()
else:
    config = load_config('config.json')
    app = run_client(config,False)
