import {Component, Property} from '@wonderlandengine/api';

class ValueAnimation {
	constructor(name,value,duration) {
		this.code = name;		
		this.target = value;
		this.start = value;
		if (Ardiserver.lastAnimatedValue[name] != undefined)
			this.start = Ardiserver.lastAnimatedValue[name];
		this.current = this.start;
		this.remaining = duration;
	}
}

/**
 * ardiserver
 */
export class Ardiserver extends Component {
    static TypeName = 'ardiserver';
    /* Properties that are configurable in the editor */
    static Properties = {
        server: Property.string("localhost"),
		site: Property.string("op"),
		secure: Property.bool(false),
		connected: Property.bool(false)
    };	
	
	static codeToName = {};
	static subscriptions = [];
	static dirty = false;
	static pointmap = {};
	static updateTimer = 0;
	static subid = "";
	static animating = [];
	static lastAnimatedValue = {};

    init() {        		
		this.isConnected = false;	
		this.isSubscribed = false;		
		this.URL = "http://" + this.server + "/s/" + this.site;	
		if (this.secure == true)		
		{
			this.URL = "https://" + this.server + "/s/" + this.site;	
		}
    }
	
	start() {
		console.log("Connecting To: " + this.URL);
		this.connect();
	}

    update(dt) {
		if (this.isConnected == true)
		{
			if (Ardiserver.dirty == true)
			{
				console.log("SUB CLEANED");
				if (this.isSubscribed == true)
				{
					this.unsubscribe();
				}
				else
				{
					this.subscribe();
				}
				console.log("Resubscribing...");
				Ardiserver.dirty = false;
			}
			
			var removal = [];
			var tvalue = 0;
			var itm = 0;
			for(var x=Ardiserver.animating.length-1;x>=0;x--)
			{			
				itm = Ardiserver.animating[x];								
				itm.remaining -= dt;
				tvalue = ((1-itm.remaining)*itm.target) + (itm.remaining*itm.start);
				if (itm.remaining <= 0)
				{
					tvalue = itm.target;
					Ardiserver.lastAnimatedValue[itm.code] = tvalue;
					removal.push(x);
				}			
				//console.log(tvalue + " = " + itm.remaining + " between " + itm.start + " and " + itm.target);			
				Ardiserver.subscriptions[Ardiserver.codeToName[itm.code]].forEach((update) => {		
							
					update[0](tvalue,update[1]);					
				});	
				itm.current = tvalue;
			}
			
			removal.forEach((indx) => {				
				Ardiserver.animating.splice(indx,1);
			});
		}
    }
	
	//
	
	subscribe() {
		console.log("Subscribe to New Data");
		var pointlookup = [];
		Object.entries(Ardiserver.subscriptions).forEach(([key, value]) => {
			if (Ardiserver.pointmap[key] == undefined)
			{
				pointlookup.push(key);
			}		  
		});
		
		if (pointlookup.length > 0)
		{
			//console.log(pointlookup);
			
			const formData = new FormData();
			formData.append('format','json');
			formData.append('points',pointlookup.join(';'));
			fetch(this.URL+"/api/lookuppoints",{method: 'POST', body: formData})
				.then(response => response.json())
				.then(data => {
					data.forEach((ele) => {
						Ardiserver.pointmap[ele.name] = ele;
						Ardiserver.codeToName[ele.code] = ele.name;
					});
					
					this.startSubscription();
				});
		}
		else
		{
			this.startSubscription();
		}
	}
	
	startSubscription() {
			
		var URL = "http://" + this.server + ":" + this.dataport + "/subscribe";
		if (this.secure == true)
		{
			URL = "https://" + this.server + "/s/" + this.site + "/data/livedata";
		}
		
		var codelist = [];
		Object.entries(Ardiserver.subscriptions).forEach((itm) => {
			codelist.push(Ardiserver.pointmap[itm[0]].code);
		});
		
		const formData = new FormData();
		formData.append('format','json');
		formData.append('codes',codelist.join(','));
		if (this.secure == true) 
		{
			formData.append('action','subscribe');
			formData.append('port',this.dataport);
		}
			
		fetch(URL,{method: 'POST', body: formData})
				.then(response => response.json())
				.then(data => {
					
					Ardiserver.subid = data.id;
					var base = null;
					data.items.forEach((itm) => {
						Ardiserver.subscriptions[Ardiserver.codeToName[itm.code]].forEach((update) => {
							update[0](itm.value,update[1]);
						});												
					});
				});
				
		Ardiserver.updatetimer = setTimeout(function () {
			this.startUpdate();
		}.bind(this),1000);
	}
	
	startUpdate() {
		if (Ardiserver.subid == "") return;
		
		var URL = "http://" + this.server + ":" + this.dataport + "/update";
		if (this.secure == true)
		{
			URL = "https://" + this.server + "/s/" + this.site + "/data/livedata";
		}
		
		const formData = new FormData();
		formData.append('format','json');
		formData.append('id',Ardiserver.subid);
		if (this.secure == true)
		{
			formData.append('action','update');
			formData.append('port',this.dataport);
		}
			
		fetch(URL,{method: 'POST', body: formData})
				.then(response => response.json())
				.then(data => {					
					var base = null;
					data.items.forEach((itm) => {
						
						Ardiserver.subscriptions[Ardiserver.codeToName[itm.code]].forEach((update) => {
							if (update[2] == true)
								update[0](itm.value,update[1]);
							else
							{
								try
								{
									this.addAnimation(itm.code,parseFloat(itm.value));
								}
								catch(e) {
									update[0](itm.value,update[1]);
								}
							}
						});							
					});
					Ardiserver.updatetimer = setTimeout(function () {
						this.startUpdate();
					}.bind(this),1000);
				});
	}
	
	unsubscribe() {
		if (Ardiserver.updateTimer != 0)
		{
			clearTimeout(Ardiserver.updatetimer);
			Ardiserver.updateTimer = 0;
		}
		
		var URL = "http://" + this.server + ":" + this.dataport + "/unsubscribe";
		if (this.secure == true)
		{
			URL = "https://" + this.server + "/s/" + this.site + "/data/livedata";
		}	
				
		const formData = new FormData();
		formData.append('format','json');
		formData.append('id',Ardiserver.subid);
		if (this.secure == true)
		{
			formData.append('action','unsubscribe');
			formData.append('port',this.dataport);
		}
			
		fetch(URL,{method: 'POST', body: formData})
				.then(response => {
					Ardiserver.subid = "";
					if (this.subscriptions.length > 0)
					{
						this.subscribe();
					}
				});						
	}
	
	connect() {
		console.log("Sending Connection Request...");
		const formData = new FormData();
		formData.append('format','json');
		fetch(this.URL+"/api/connect",{method: 'POST', body: formData})
            .then(response => response.json())
            .then(data => {
				console.log("Got Connection Response...");
				for(var q=0;q<data.services.length;q++)
				{
					if (data.services[q].name == 'data')
					{
						this.dataport = data.services[q].port;
						console.log("ARDI data on port #" + this.dataport);
					}
				}
				this.isConnected = true;
				this.connected = true;
			});
	}
	
	addAnimation(code, value) {
		Ardiserver.animating.forEach((itm) => {
			if (itm.code == code)
			{
				itm.start = itm.current;
				itm.target = value;
				itm.remaining = 1;
				
				if (itm.start == itm.target)
				{
					itm.remaining = 0;
				}
				return;
			}
		});
		
		var anim = new ValueAnimation(code,value,1);		
		Ardiserver.animating.push(anim);
	};
	
	static AddSubscription(code,callback,context,discrete) {
		if (discrete == undefined) discrete = false;
		console.log("Adding Subscription To " + code);
		if (this.subscriptions[code] == undefined)
		{
			this.subscriptions[code] = [];
			//console.log("SUB DIRTY");
			this.dirty = true;
		}		
		this.subscriptions[code].push([callback,context,discrete]);		
	}
	
	static DropAllSubscriptions(context) {
		
	}
	
	static DropSubscription(code,context) {
		
	}
}

export class ArdiBinding extends Component {
    static TypeName = 'ardibinding';
    /* Properties that are configurable in the editor */
    static Properties = {
        source: Property.string("Asset.Property"),
		target: Property.string("value"),
		comp: Property.string(""),
		count: Property.int(0),
		mode: Property.string("scale"),
		x1: Property.float(0),
		y1: Property.float(100),
		x2: Property.float(0),
		y2: Property.float(1),
		discrete: Property.bool(false)
    };	
	
	start() {		
		Ardiserver.AddSubscription(this.source,function (v) {
			var txt = false;
			try {
				v = parseFloat(v);
			}
			catch {
				txt = true;
			};
			
			if (this.mode == "scale")
			{
				v = (v - this.x1) / (this.y1 - this.x1);
				v = (v * (this.y2 - this.x2)) + this.x2;				
			}
			if (this.mode == "text")
			{
				if (txt == false)
				{
					v = v.toFixed(this.x1);
				}
			}
			
			var ob = this.object.getComponent(this.comp,0);
			if (ob != null)
			{
				ob[this.target] = v;
			}
		}.bind(this),this);
		
	}
}
