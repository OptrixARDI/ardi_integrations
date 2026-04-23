import { Component, Behavior, BehaviorConstructorProps, ContextManager, registerBehaviorRunAtDesignTime } from "@zcomponent/core";
import { default as Scene_zcomp } from "./Scene.zcomp";
import { default as Scene} from "./Scene.zcomp";
import {useOnBeforeRender } from "@zcomponent/core"

class ValueAnimation {
	code: string;
	target: number;
	start: number;
	current: number;
	remaining: number;

	constructor(name,value,duration) {
		this.code = name;		
		this.target = value;
		this.start = value;
		if (ARDIServer.lastAnimatedValue[name] != undefined)
			this.start = ARDIServer.lastAnimatedValue[name];
		this.current = this.start;
		this.remaining = duration;
	}
}

class PointLink {

}

class Subscription {
	func: (value: number) => void;
	context: string;
}

interface ConstructionProps {
	// Add any constructor props you'd like for your behavior here
	server: string;
	site: string;
	secure: boolean;
}

/**
 * @zbehavior 
 **/
export class ARDIServer extends Behavior<Scene_zcomp> {

	protected url = "";
	protected zcomponent = this.getZComponentInstance(Scene);
		
	static codeToName : Map<string,string> = new Map();
	static subscriptions : Map<string,object[]> = new Map();
	static dirty: boolean = false;
	static pointmap : Map<string,ValueAnimation> = new Map();
	static updateTimer = 0;
	static subid : string = "";
	static animating : ValueAnimation[] = [];
	static lastAnimatedValue = {};
	static updatetimer : number = 0;
	static dataport : string = "8080";

	public isConnected: boolean = false;
	public isSubscribed: boolean = false;

	/**
	* @zui
	* @zdefault localhost
	*/
	public server: string = "localhost";

	/**
	* @zui
	* @zdefault op
	*/
	public site: string = "op";

	/**
	* @zui
	* @zdefault false
	*/
	public secure: boolean = false;
	public isConnecting: boolean = false;	

	constructor(contextManager: ContextManager, instance: Scene_zcomp, protected constructorProps: ConstructionProps) {
		super(contextManager, instance);

		//ARDIServer.pointmap = new Map();
		//ARDIServer.subscriptions = new Map();

		this.isConnected = false;	
		this.isSubscribed = false;
		this.isConnecting = false;		
		this.url = "http://" + this.server + "/s/" + this.site;	
		if (this.secure == true)		
		{
			this.url = "https://" + this.server + "/s/" + this.site;	
		}

		console.log("Wanting To Connect To " + this.url);
		
		this.register(useOnBeforeRender(contextManager), dt => {
			if (this.isConnected == false)
			{
				if (this.isConnecting == false)
				{
					this.connect();
				}
			}
			if (this.isConnected == true)
		{
			if (ARDIServer.dirty == true)
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
				ARDIServer.dirty = false;
			}
			
			var removal : number[] = [];
			var tvalue = 0;
			var itm : ValueAnimation;
			for(var x=ARDIServer.animating.length-1;x>=0;x--)
			{			
				itm = ARDIServer.animating[x];								
				itm.remaining -= dt;
				tvalue = ((1-itm.remaining)*itm.target) + (itm.remaining*itm.start);
				if (itm.remaining <= 0)
				{
					tvalue = itm.target;
					ARDIServer.lastAnimatedValue[itm.code] = tvalue;
					removal.push(x);
				}			
				//console.log(tvalue + " = " + itm.remaining + " between " + itm.start + " and " + itm.target);
				let nm : string | undefined = ARDIServer.codeToName.get(itm.code);	
				if (nm != undefined)
				{		
					let arr = ARDIServer.subscriptions.get(nm);
					if (arr != undefined)
					{
						arr.forEach((update) => {											
							update[0](tvalue,update[1]);					
						});
					}
				}	
				itm.current = tvalue;
			}
			
			removal.forEach((indx) => {				
				ARDIServer.animating.splice(indx,1);
			});
		}
		});
	}

	dispose() {
		// Clean up any resources
		// ...
		return super.dispose();
	}

	subscribe() {
		console.log("Subscribe to New Data");
		var pointlookup : string[] = [];

		for(const key of ARDIServer.subscriptions.keys())
		{			
			if (!ARDIServer.pointmap.has(key))
			{
				pointlookup.push(key);
			}		  
		};
		
		if (pointlookup.length > 0)
		{
			//console.log(pointlookup);
			
			const formData = new FormData();
			formData.append('format','json');
			formData.append('points',pointlookup.join(';'));
			fetch(this.url+"/api/lookuppoints",{method: 'POST', body: formData})
				.then(response => response.json())
				.then(data => {
					data.forEach((ele) => {
						ARDIServer.pointmap.set(ele.name,ele);
						ARDIServer.codeToName.set(ele.code,ele.name);
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
			
		var URL = "http://" + this.server + ":" + ARDIServer.dataport + "/subscribe";
		if (this.secure == true)
		{
			URL = "https://" + this.server + "/s/" + this.site + "/data/livedata";
		}
		
		let codelist : string[] = [];
		//var keys : string[] = ARDIServer.subscriptions.keys();
		//for(var x:number = 0;x<keys.length;x++)
		for (const key of ARDIServer.subscriptions.keys())
		{			
			let itm = ARDIServer.pointmap.get(key);
			if (itm !== undefined)
				codelist.push(itm.code);  
		};		
		
		const formData = new FormData();
		formData.append('format','json');
		formData.append('codes',codelist.join(','));
		if (this.secure == true) 
		{
			formData.append('action','subscribe');
			formData.append('port',ARDIServer.dataport);
		}
			
		fetch(URL,{method: 'POST', body: formData})
				.then(response => response.json())
				.then(data => {
					
					ARDIServer.subid = data.id;
					var base = null;
					data.items.forEach((itm) => {
						let nm : string | undefined = ARDIServer.codeToName.get(itm.code);
						if (nm != undefined) {
							let arr = ARDIServer.subscriptions.get(nm);
							if (arr != undefined) {
								arr.forEach((update) => {
									update[0](itm.value,update[1]);
								});						
							};						
						}
						
					});
				});

	 	console.log("Fetch...");
				
		ARDIServer.updatetimer = setTimeout(function () {
			this.startUpdate();
		}.bind(this),1000);
	}
	
	startUpdate() {
		if (ARDIServer.subid == "") return;
		
		var URL = "http://" + this.server + ":" + ARDIServer.dataport + "/update";
		if (this.secure == true)
		{
			URL = "https://" + this.server + "/s/" + this.site + "/data/livedata";
		}
		
		const formData = new FormData();
		formData.append('format','json');
		formData.append('id',ARDIServer.subid);
		if (this.secure == true)
		{
			formData.append('action','update');
			formData.append('port',ARDIServer.dataport);
		}
			
		fetch(URL,{method: 'POST', body: formData})
				.then(response => response.json())
				.then(data => {					
					var base = null;
					data.items.forEach((itm) => {
						let nm : string | undefined = ARDIServer.codeToName.get(itm.code);
						if (nm != undefined) {
							let arr = ARDIServer.subscriptions.get(nm);
							if (arr != undefined) {
								arr.forEach((update) => {
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
							};
						};							
					});
					ARDIServer.updatetimer = setTimeout(function () {
						this.startUpdate();
					}.bind(this),1000);
				});
		console.log("Update Fetch...");
	}
	
	unsubscribe() {
		if (ARDIServer.updateTimer != 0)
		{
			clearTimeout(ARDIServer.updatetimer);
			ARDIServer.updateTimer = 0;
		}
		
		var URL = "http://" + this.server + ":" + ARDIServer.dataport + "/unsubscribe";
		if (this.secure == true)
		{
			URL = "https://" + this.server + "/s/" + this.site + "/data/livedata";
		}	
				
		const formData = new FormData();
		formData.append('format','json');
		formData.append('id',ARDIServer.subid);
		if (this.secure == true)
		{
			formData.append('action','unsubscribe');
			formData.append('port',ARDIServer.dataport);
		}
			
		fetch(URL,{method: 'POST', body: formData})
				.then(response => {
					ARDIServer.subid = "";
					if (ARDIServer.subscriptions.size > 0)
					{
						this.subscribe();
					}
				});						
	}
	
	connect() {
		this.isConnecting = true;
		console.log("Sending Connection Request...");
		const formData = new FormData();
		formData.append('format','json');
		fetch(this.url+"/api/connect",{method: 'POST', body: formData})
            .then(response => response.json())
            .then(data => {
				console.log("Got Connection Response...");
				for(var q=0;q<data.services.length;q++)
				{
					if (data.services[q].name == 'data')
					{
						ARDIServer.dataport = data.services[q].port;
						console.log("ARDI data on port #" + ARDIServer.dataport);
					}
				}
				this.isConnecting = false;
				this.isConnected = true;
				//this.connected = true;
			});
	}
	
	addAnimation(code, value) {
		ARDIServer.animating.forEach((itm: ValueAnimation) => {
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
		ARDIServer.animating.push(anim);
	};
	
	static AddSubscription(code : string,callback: (value:number) => void,context: object,discrete: boolean) {
		if (discrete == undefined) discrete = false;
		console.log("Adding Subscription To " + code);
		if (!ARDIServer.subscriptions.has(code))
		{
			ARDIServer.subscriptions.set(code,[]);//[code] = [];
			//console.log("SUB DIRTY");
			ARDIServer.dirty = true;
		}
		
		let lst = ARDIServer.subscriptions.get(code);
		if (lst != undefined)
			lst.push([callback,context,discrete]);	
		
	}
}

// Uncomment below to run this behavior at design time
// registerBehaviorRunAtDesignTime(ARDIServer);
