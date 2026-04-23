module.exports = function(RED) {
    function ARDIPointNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
		this.numeric = config.numeric;
		this.server = RED.nodes.getNode(config.server);
		this.status({fill:"red",shape:"ring",text:"disconnected"});
		
		var session = this.context().global.ardiConnections[this.server.server + "/s/" + this.server.site];		
		session.addPointName(this.name,(value) => {	
			if (this.numeric == true) value = parseFloat(value);
			var msg = { payload: value };
			node.send(msg);			
			this.status({fill:"green",shape:"dot",text:"connected"});
		});
    }
    RED.nodes.registerType("ardi-point",ARDIPointNode);
}