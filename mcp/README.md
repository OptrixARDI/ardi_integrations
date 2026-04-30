####ARDI MCP Service

Allows easy integration of ARDI servers into LLMs

NOTE: The ARDI server must have the 'MCP' addon installed and enabled.

###Installing (Local)

If you will be running the MCP service locally (on the client PC rather than on a server), modify the 'servername' in **ardimcplocal.py** and distribute it to your users.

Clients will require **Python** to be installed, along with the **Requests** library.

###Installing (Streaming/Web-Based)

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

###Running

To run, go to the folder where you installed the script.

Select a port to run your server from. If setting this up on a container or dedicated VM, use port 443 (the standard SSL port). If setting it up on your ARDI server, come up with a random, unused port number instead.

##HTTP

.mcp/bin/uvicorn ardimcp:app --host 0.0.0.0 --port 443

##HTTPS

.mcp/bin/uvicorn ardimcp:app --host 0.0.0.0 --port 443 --ssl-keyfile=<keyfile> --ssl-certfile=<certfile>

##Running as a Daemon

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

###Client Configuration

See [[https://ardi.com.au/docs/mcp:welcome]] for a discusson of setting up clients to use the MCP server.

If running this on your ARDI server (or a server with a running web service), see [[https://ardi.com.au/docs/mcp:proxy]] for details covering how to set up Apache2 as a proxy.