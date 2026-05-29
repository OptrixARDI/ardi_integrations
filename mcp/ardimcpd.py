from fastmcp import FastMCP
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware import Middleware
from fastapi import Request
from typing import Callable
from starlette.middleware.base import BaseHTTPMiddleware
import requests
import sys
import traceback
import inspect

mcp = FastMCP("ARDI MCP Server")

server = "http://localhost/s/op"

toollist = requests.get(server+"/mcp/dynamic").json()['tools']

global finaltools
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

_TYPE_MAP = {
    "string": str,
    "integer": int,
    "number": float,
    "boolean": bool,
    "object": dict,
    "array": list,
}

mcp = FastMCP("MCPBridge")

def _make_tool_handler(tool_name: str):
    def handler(**kwargs):
        global finaltools
        found = False
        for t in finaltools:
            if t['name'] == tool_name:
                found = True
                break
        if not found:
            return "Invalid Tool Name"
        
        print(str(kwargs))

        args = {}
        for p in t['parameters']:
            if p['name'] in kwargs:
                args[p['name']] = kwargs[p['name']]   

        print(str(args))         

        dt = requests.post(server + "/mcp/" + tool_name, data=args)
        return dt.text

    return handler

print(str(finaltools))

for tool_def in finaltools:
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

    handler = _make_tool_handler(tool_def["name"])
    handler.__name__ = tool_def["name"]
    handler.__doc__ = tool_def["description"]
    handler.__signature__ = inspect.Signature(params)
    handler.__annotations__ = annotations

    mcp.tool()(handler)
    print(f"Registered tool: {tool_def['name']}")

app = mcp.http_app()

#Adds additional headers to results
class CustomHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable):
         response = await call_next(request)
         response.headers["anthropic-beta"] = "mcp-client-2025-11-20"
         return response

app.add_middleware(CustomHeaderMiddleware)

try:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allows all origins
        allow_credentials=True,
        allow_methods=["*"],  # Allows all methods (GET, POST, etc.)
        allow_headers=["*"],  # Allows all headers
        expose_headers=["mcp-session-id"]
    )
except:
    traceback.print_exc()