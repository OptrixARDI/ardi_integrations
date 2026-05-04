# ARDI MCP Service

Allows easy integration of ARDI servers into LLMs

NOTE: The ARDI server must have the 'MCP' addon installed and enabled.

## Installing

Copy the .py file into a chosen folder on your host.
Modify the 'servername' variable to point towards the ARDI server you want to connect to.
In the folder with the code, create a virtual Python environment with...
```
python -m venv .mcp
```

Activate that new environment...
```
.mcp\Scripts\activate
```

Install the required Python modules into that environment.
```
pip install -r requirements.txt
```

## Running

To run, go to the folder where you installed the script.

Select a port to run your server from. If setting this up on a container or dedicated VM, use port 443 (the standard SSL port). If setting it up on your ARDI server, come up with a random, unused port number instead.

### HTTP

.mcp/bin/uvicorn ardimcp:app --host 0.0.0.0 --port 443

### HTTPS

.mcp/bin/uvicorn ardimcp:app --host 0.0.0.0 --port 443 --ssl-keyfile=<keyfile> --ssl-certfile=<certfile>

### Running as a Daemon

To run this is a service on a Linux system, create the following file in your /etc/systemd/system/ folder, updating the paths as required. In this example, we will call the service 'mcp' and make a file named 'mcp.service'.

```
[Unit]
Description=Uvicorn MCP Server
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=<installfolder>
Environment="PATH=<installfolder>/.mcp/bin"
ExecStart=<installfolder>.mcp/bin/uvicorn ardimcp:app --host 0.0.0.0 --port 8000 --ssl-keyfile=<keyfile> --ssl-certfile=<certfile>
Restart=always

[Install]
WantedBy=multi-user.target
```

Then launch the service with...

```
service mcp start
service mcp enable
```

## Client Configuration

See https://ardi.com.au/docs/mcp:welcome for a discusson of setting up clients to use the MCP server.

If running this on your ARDI server (or a server with a running web service), see https://ardi.com.au/docs/mcp:proxy for details covering how to set up Apache2 as a proxy.

## Bridging

The **mcpbridge.py** script is used when running an ARDI server behind a firewall. You use this script in two locations - on the ARDI server itself in _server_ mode (called the bridge-server), and on an Internet-accessible server (such as a DigitalOcean, AWS or Azure public server) in _client_ mode (called the bridge-client).

This uses an MQTT server as a MCP proxy. An LLM connects to the bridge-client. Tool requests sent to the MQTT server by the bridge-client and read by the bridge-server. The bridge-server then sends the query onto the ARDI server, which responds. The response is sent back to MQTT and from there back to the bridge-client and from there to the LLM.

This gives you online access to MCP data, without exposing the ARDI server to direct online traffic.

### Running the Bridge

Install Python and the mcpbridge.py file on both the ARDI server (or a server on the secure network) and on an Internet-accessible system.

Fill in the configuration file with the details of the shared MQTT server. You might also want to add additional auth/validation options to the Python file.

On the secure network, run **mcpbridge.py server --config <configpath>**.

On the internet-facing server, run **uvicorn mcpbridge:app** in the folder that contains both the script and **config.json**.

You should now be able to query servers on the secure network via the bridge on the Internet.