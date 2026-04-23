module.exports = function(RED) {
    function ARDIServerNode(n) {
        RED.nodes.createNode(this,n);
        this.host = n.host;
        this.port = n.port;
		this.site = n.site;
		this.ssl = n.ssl;
		
		let sessM = new Object();
		
		sessM.translations = [];
		sessM.subscriptions = {};
		sessM.subid = 0;
		sessM.timer = 0;
		sessM.connectTimer = 0;
		sessM.dirty = false;
		sessM.host = n.host;
		sessM.port = n.port;
		sessM.site = n.site;
		sessM.ssl = n.ssl;
		sessM.dataport = 0;
		sessM.datapoints = [];
		sessM.mapping = {};
		
		sessM.addPointName = function (name,callback) {
			console.log("Adding Point: " + name);
			this.translations.push([name,callback]);
			this.dirty = true;
						
			//Initialise connection if there is none...
			if ((this.timer == 0) && (this.connectTimer == 0))
			{
				this.connectTimer = setTimeout(() => {
					this.update();
				},500);
			}
		};
		
		sessM.addSelectedPoints = function(selector,callback) {			
			this.dirty = true;
		};		
		
		sessM.baseURL = function() {
			let url = "";
			if (this.ssl == true) 
				url += "https://";
			else
				url += "http://";
			
			url += this.host;
			if (this.port != "")
				url += this.port;
			url += "/s/" + this.site;
			return url;
		}
		
		sessM.connect = function() {
			
			let url = this.baseURL();					
			const formData = new FormData();
			formData.append('format', 'json');
			fetch(url+"/api/connect", { method: 'POST', body: formData }).then((dta) => {
				dta.json().then((content) => {
					content.services.forEach((itm) => {
						if (itm.name == 'data')
						{
							this.dataport = itm.port;
							console.log("Data Port: " + this.dataport);
						}
					});
				},(err) => {
					console.log("Failed To Get Data");
					console.log(err);
				});				
				
			},(err) => {
				console.log("Failed To Get Data");
				console.log(err);
			});
		}
		
		sessM.callConsolidator = function(func) {
			var url = "http://" + this.host + ":" + this.dataport + "/func";
			
			if (this.subid == "") func = "subscribe";
			
			const formData = new FormData();
			formData.append('format', 'json');
			if (func == 'subscribe')
			{
				var cd = "";
				Object.keys(this.datapoints).forEach((itm) => {
					if (cd != "") cd += ";";
					cd += itm;
				});
				formData.append('codes',cd);
			}
			else
			{
				formData.append('id',this.subid);
			}
			
			if (this.ssl == true) 
			{
				url = "https://" + this.host + "/s/" + this.site + '/data/livedata';
				formData.append('port',this.dataport);
				formData.append('action',func);
			}			
						
			fetch(url, { method: 'POST', body: formData }).then((dta) => {
				dta.json().then((content) => {
					if (content.id != undefined)
						this.subid = content.id;
					
					content.items.forEach((itm) => {
						//console.log("Writing " + itm.value + " to " + itm.code);
						this.datapoints[itm.code](itm.value);
					});
					
				},(err) => {
					//Might need to resubscribe...
					this.subid = "";
					console.log("Failed To Get Data");
					console.log(err);
				});				
				
			},(err) => {
				console.log("Failed To Get Data");
				console.log(err);
			});
			
			this.timer = setTimeout(() => {
				this.update();
			},1000);
		}
		
		sessM.update = function() {
			if (this.dirty == true)
			{
				if (this.translations.length > 0)
				{
					//Call lookup function
					let url = this.baseURL();		
					console.log("Target URL: " + url);
					
					let codes = "";
					this.translations.forEach((itm) => {
						if (codes != "")
							codes += ";";
						codes += itm[0];
					});									
										
					const formData = new FormData();
					formData.append('format', 'json');
					formData.append('points', codes);
					fetch(url+"/api/lookuppoints", { method: 'POST', body: formData }).then((dta) => {
						dta.json().then((content) => {							
							content.forEach((itm) => {
								this.mapping[itm.name] = itm.code;
								for(var q=0;q<this.translations.length;q++)
								{
									if (this.translations[q][0] == itm.name)
									{
										this.datapoints[itm.code] = this.translations[q][1];
										break;
									}
								}								
							});
							
							this.translations = [];
																					
							if (this.subid != 0)
							{
								//Unsubscribe
							}
							
							if (Object.keys(this.datapoints).length > 0)
							{
								//Resubscribe
								this.callConsolidator("subscribe");
							}
						},(err) => {
							console.log("Failed To Get Data");
							console.log(err);
						});				
						
					},(err) => {
						console.log("Failed To Get Data");
						console.log(err);
					});											
					
					this.dirty = false;				
				}
				else
				{
					if (this.subid != 0)
					{
						//Unsubscribe
					}
					
					if (Object.keys(this.datapoints).length > 0)
					{
						console.log("Resubbbing");
						this.callConsolidator("subscribe");
					}
					this.dirty = false;				
				}
			}
			else
			{
				//console.log("Updating...");
				this.callConsolidator("update");
			}
		}
		
		if (this.context().global.ardiConnections == undefined)
		{
			this.context().global.ardiConnections = {};
		}
		this.context().global.ardiConnections[this.server + "/s/" + this.site] = sessM;
		sessM.connect();
		
    }
    RED.nodes.registerType("ardi-server",ARDIServerNode);
}