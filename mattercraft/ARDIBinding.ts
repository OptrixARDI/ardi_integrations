import { Component, Behavior, BehaviorConstructorProps, ContextManager, registerBehaviorRunAtDesignTime } from "@zcomponent/core";
import { default as Scene} from "./Scene.zcomp";
import { ARDIServer } from "./ARDIServer";
import {useOnBeforeRender } from "@zcomponent/core";

interface ConstructionProps {
	// Add any constructor props you'd like for your behavior here
	/**
	* @zui
	* @zdefault 
	*/
	property : string;

	/**
	* @zui
	* @zdefault asset.property
	*/
	point: string;	

	/**
	* @zui
	* @zdefault 1
	*/
	mode : number;

	/**
	* @zui
	* @zdefault 0
	*/
	alpha : number;

	/**
	* @zui
	* @zdefault 100
	*/
	beta : number;

	/**
	* @zui
	* @zdefault 0
	*/
	gamma : number;

	/**
	* @zui
	* @zdefault 1
	*/
	delta : number;

	/**
	* @zui
	* @zdefault 1
	*/
	animate : boolean;
}

/**
 * @zbehavior 
 **/
export class ARDIBinding extends Behavior<Component> {

	protected zcomponent = this.getZComponentInstance(Scene);

	public property : string;
	public point : string;
	private mode : number;
	private alpha : number;
	private beta : number;
	private delta : number;
	private gamma : number;
	private animate: boolean;
	

	constructor(contextManager: ContextManager, instance: Component, protected constructorProps: ConstructionProps) {
		super(contextManager, instance);

		this.property = constructorProps.property;
		this.point = constructorProps.point;
		this.alpha = constructorProps.alpha;
		this.beta = constructorProps.beta;
		this.gamma = constructorProps.gamma;
		this.delta = constructorProps.delta;
		this.mode = constructorProps.mode;
		this.animate = constructorProps.animate;

		console.log("Subscribing To " + this.point);
		ARDIServer.AddSubscription(this.point,(value) => {			
			let v : any = value;
			if (this.mode == 1) {
				v = parseFloat(v);
				v = (v - this.alpha) / (this.beta - this.alpha);
				v = (v * (this.delta-this.gamma)) + this.gamma;
			}
			if (this.mode == 2)
			{
				v = parseFloat(v);
				v = v.toFixed(this.alpha);
			}			
			var parts = this.property.split('.');
			if (parts.length == 1)
				this.instance[this.property] = v;
			else
			{
				let context = this.instance[parts[0]];
				for(var q=1;q<parts.length-1;q++){
					context = context[parts[q]];
				}
				context[parts[parts.length-1]] = v;
			}
		},this,this.animate);
	}

	dispose() {
		// Clean up any resources
		// ...
		return super.dispose();
	}
}

// Uncomment below to run this behavior at design time
// registerBehaviorRunAtDesignTime(ARDIBinding);
