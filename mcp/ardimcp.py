from fastmcp import FastMCP
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware import Middleware
from fastapi import Request
from typing import Callable
from starlette.middleware.base import BaseHTTPMiddleware
import requests
import sys
import traceback

mcp = FastMCP("ARDI MCP Server")

server = "https://demo.optrix.com.au/s/pl/mcp"

@mcp.tool
def assetsearch(name: str) -> str:
    """Check to see if a named asset exists. Assets can be equipment, but can also be people, departments and concepts. If looking for alerts or issues, use the observations function instead. A semi-colon (;) delimited list of possible names for a single asset. If a name includes a measurement (such as speed or temperature), also try without that measurement name - when asked for 'Machine Pressure', also search for just 'Machine'."""
    dt = {}
    dt['name'] = name
    try:
        #print("Asking For Name: " + str(dt))
        print("Asking for Name: " + str(dt), file=sys.stderr)
        resp = requests.post(server + "/assetsearch",data=dt)
        return resp.text
    except:
        traceback.print_exc()
        return "FAILED TO CALL TOOL"

@mcp.tool
def assetinfo(name: str) -> str:
    """Gets the details of an asset based on its name or its unique ID. The name should be confirmed with the 'assetsearch' tool before calling. """
    dt = {}
    dt['name'] = name
    try:
        resp = requests.post(server + "/assetinfo",data=dt)
        return resp.text
    except:
        return "FAILED TO CALL TOOL"

@mcp.tool
def assetcontext(name: str) -> str:
    """Gets properties of an asset and those inside, around and near it. Use only when 'assetinfo' does not find any suitable properties. Takes the name or unique ID of the asset."""
    dt = {}
    dt['name'] = name
    try:
        resp = requests.post(server + "/assetcontext",data=dt)
        return resp.text
    except:
        return "FAILED TO CALL TOOL"

@mcp.tool
def getmedia(name: str) -> str:
    """Gets a list of text, PDF and other documentaton files for an asset."""
    dt = {}
    dt['name'] = name
    try:
        resp = requests.post(server + "/getmedia",data=dt)
        return resp.text
    except:
        return "FAILED TO CALL TOOL"

@mcp.tool
def readmedia(name: str, media: str) -> str:
    """Reads the content of a PDF, TXT or similar media file found with 'getmedia'"""
    dt = {}
    dt['name'] = name
    dt['medianame'] = media
    try:
        resp = requests.post(server + "/readmedia",data=dt)
        return resp.text
    except:
        return "FAILED TO CALL TOOL"

@mcp.tool
def typesearch(name: str) -> str:
    """Searches for an asset based on its type. Often used when there's no results for the 'assetsearch' function. Takes a semicolon-delimited list of possible type names and synonyms."""
    dt = {}
    dt['typename'] = name
    try:
        resp = requests.post(server + "/typesearch",data=dt)
        return resp.text
    except:
        return "FAILED TO CALL TOOL"

@mcp.tool
def livedata(assets: str,properties: str) -> str:
    """Gets the live/current values of any properties on a named asset. You MUST verify the assets and properties exist (with 'assetinfo') before calling this function. The parameters are semicolon-delimited lists of asset and property names."""
    dt = {}
    dt['assets'] = assets
    dt['properties'] = properties
    try:
        resp = requests.post(server + "/livedata",data=dt)
        return resp.text
    except:
        return "FAILED TO CALL TOOL"

@mcp.tool
def gethistory(assets: str,properties: str,range: str) -> str:
    """Gets the historical values of asset properties. You MUST verify the assets and properties exist (with 'assetinfo') before calling. Assets and Properties contain a semicolon-delmited list of asset and property names. The range parameter contains a relative time-frame, such as A text description of the time span to be read, such as '1 hour' or '20 minutes'. This result includes the query you can use to access the data at runtime. If creating your own query with the resulting data, remember that asset and property names are comma (not semicolon) delimited in the query language."""
    dt = {}
    dt['assets'] = assets
    dt['properties'] = properties
    dt['range'] = range
    print("Requesting History: " + str(dt))
    try:
        resp = requests.post(server + "/gethistory",data=dt)
        return resp.text
    except:
        return "FAILED TO CALL TOOL"

@mcp.tool
def getinstruct(topic: str) -> str:
    """Gets ARDI documentation on coding methods. Used only when writing code. 'reporting' for creating Python reports, 'livedisplays' for live, web-based displays, 'alerts' for creating persistent alerts, and 'model' for creating persistent calculations and comparisons."""
    dt = {}
    dt['topic'] = topic
    try:
        resp = requests.post(server + "/getinstruct",data=dt)
        return resp.text
    except:
        return "FAILED TO CALL TOOL"

@mcp.tool
def getrelated(startasset: str,relationship: str, direction: str) -> str:
    """Gets a list of every asset that is related to a particular parent asset. You MUST call assetinfo on the parent to discover what relationships exist. If the user isn't clear on which relationship, assume it's one related to the assets name or the system it's part of (ie. 'down stream' from the 'Main Water Isolator' or a valve in the 'Water Supply System' should use the 'Water' relationship, if one is available. Direction is 'up' for upstream (towards parents) and 'down' for downstream (towards children)"""
    dt = {}
    dt['startingasset'] = startasset
    dt['relationship'] = relationship
    dt['direction'] = direction
    try:
        resp = requests.post(server + "/getrelated",data=dt)
        return resp.text
    except:
        return "FAILED TO CALL TOOL"

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