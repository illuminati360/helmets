/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MRE from '@microsoft/mixed-reality-extension-sdk';
import { fetchJSON } from './utils';

const fetch = require('node-fetch');
const isNaughty = process.env['NAUGHTY'];
const password = process.env['PASSWORD'];

/**
 * The structure of a hat entry in the hat database.
 */
type HatDescriptor = {
    resourceId: string;
    attachPoint: string;
    scale: {
        x: number;
        y: number;
        z: number;
    };
    rotation: {
        x: number;
        y: number;
        z: number;
    };
    position: {
        x: number;
        y: number;
        z: number;
    };
    previewMargin: number;
    menuScale?: number;
};

/**
 * WearAHat Application - Showcasing avatar attachments.
 */
export default class WearAHat {
    // Container for primitives
    private assets: MRE.AssetContainer;

    // Container for instantiated hats.
    private attachedHats = new Map<MRE.Guid, MRE.Actor[]>();
    private attachedHatIds = new Map<MRE.Guid, string[]>();

    // Load the database of hats.
    // tslint:disable-next-line:no-var-requires variable-name
    private HatDatabase: { [key: string]: HatDescriptor } = {};

    // Options
    private previewMargin = 1.5; // spacing between preview objects

    private menu: MRE.Actor;
    private helmetKitsList: string[] = isNaughty? ['galaxy_flyin_3', 'bdsm'] : ['space_helmets', 'helmets', 'city_helmets', 'galaxy_flyin_3', 'town_helmets'];
    private helmetKitIndex: number = 0;
    private invisibleMaterial: MRE.Material;

    private allowedList: string[];
    /**
     * Constructs a new instance of this class.
     * @param context The MRE SDK context.
     * @param baseUrl The baseUrl to this project's `./public` folder.
     */
    constructor(private context: MRE.Context, private params: MRE.ParameterSet, private baseUrl: string) {
        this.assets = new MRE.AssetContainer(context);

        this.invisibleMaterial = this.assets.createMaterial('invis', { color: MRE.Color4.FromColor3(MRE.Color3.Red(), 0.0), alphaMode: MRE.AlphaMode.Blend });

        // Hook the context events we're interested in.
        this.context.onStarted(async () => {
            // Choose the set of helmets
            // defaults include actions like Clear, Move Up/Down, and Size Up/Down
            // e.g. ws://10.0.1.89:3901?kit=city_helmets
            await this.loadAllowedList();
            await this.loadKit(this.helmetKitsList[ this.helmetKitIndex ]);
            this.started();
        });

        this.context.onUserJoined(user => this.userJoined(user));
        this.context.onUserLeft(user => this.userLeft(user));
    }

    private async loadAllowedList(){
        this.allowedList = await fetchJSON(`${this.baseUrl}/allowed.json`);
    }

    private async loadKit(kit: string){
        switch(kit) {
            case "city_helmets": {
                this.HatDatabase = Object.assign({}, await fetchJSON(`${this.baseUrl}/defaults.json`), await fetchJSON(`${this.baseUrl}/data/1167643861778956427_city_helmets.json`) );
                break;
            }
            case "space_helmets": {
                this.HatDatabase = Object.assign({}, await fetchJSON(`${this.baseUrl}/defaults.json`), await fetchJSON(`${this.baseUrl}/data/1166467957212054271_space_helmets.json`) );
                break;
            }
            case "galaxy_flyin_3": {
                this.HatDatabase = Object.assign({}, await fetchJSON(`${this.baseUrl}/defaults.json`), await fetchJSON(`${this.baseUrl}/data/1166467957212054271_galaxy_flyin_3.json`) );
                break;
            }
            case "town_helmets": {
                this.HatDatabase = Object.assign({}, await fetchJSON(`${this.baseUrl}/defaults.json`), await fetchJSON(`${this.baseUrl}/data/1172957249807582137_town_helmets.json`) );
                break;
            }
            case "helmets": {
                this.HatDatabase = Object.assign({}, await fetchJSON(`${this.baseUrl}/defaults.json`), await fetchJSON(`${this.baseUrl}/data/1639807677510976021_helmets.json`) );
                break;
            }
            case "bdsm": {
                this.HatDatabase = Object.assign({}, await fetchJSON(`${this.baseUrl}/defaults.json`), await fetchJSON(`${this.baseUrl}/data/1642377437377463002_bdsm.json`) );
                break;
            }
            default: { // all - manually combined
                this.HatDatabase = Object.assign({}, await fetchJSON(`${this.baseUrl}/data/all.json`), await fetchJSON(`${this.baseUrl}/defaults.json`));
                break;
            }
        }
    }

    /**
     * Called when a Hats application session starts up.
     */
    private async started() {
        // Show the hat menu.
        this.showHatMenu();
    }

    /**
     * Called when a user leaves the application (probably left the Altspace world where this app is running).
     * @param user The user that left the building.
     */
    private userLeft(user: MRE.User) {
        // If the user was wearing a hat, destroy it. Otherwise it would be
        // orphaned in the world.
        if (this.attachedHats.has(user.id)) { this.attachedHats.get(user.id).forEach(h=>h.destroy()); }
        this.attachedHats.delete(user.id);
        this.attachedHatIds.delete(user.id);
    }

    private userJoined(user: MRE.User) {
        if (this.allowedList.includes(user.name)){
            user.groups.add('allowed');
        }else if (user.groups.has('allowed')){
            user.groups.delete('allowed');
        }
    }

    /**
     * Show a menu of hat selections.
     */
    private showHatMenu() {
        // Create a parent object for all the menu items.
        this.menu = MRE.Actor.Create(this.context, {});

        let x = 0;

        // check for options first since order isn't guaranteed in a dict
        for (const k of Object.keys(this.HatDatabase)) {
            if (k == "options"){
                const options = this.HatDatabase[k]
                if (options.previewMargin){
                    this.previewMargin = options.previewMargin;
                }
            }
        }

        // Loop over the hat database, creating a menu item for each entry.
        for (const hatId of Object.keys(this.HatDatabase)) {
            if (hatId == "options") continue; // skip the special 'options' key

            const hatRecord = this.HatDatabase[hatId];

            // Create a clickable button.
            var button;

            // special scaling and rotation for commands
            // let regex: RegExp = /!$/; // e.g. clear!
            const rotation = (hatRecord.rotation) ? hatRecord.rotation : { x: 0, y: 0, z: 0 };
            const position = (hatRecord.position) ? hatRecord.position : { x: 0, y: 0, z: 0 };
            let scale = (hatRecord) ? (hatRecord.scale ? hatRecord.scale : {x: 3, y: 3, z: 3}) : { x: 3, y: 3, z: 3 };
            if (hatRecord.menuScale){
                scale = {x: scale.x*hatRecord.menuScale, y: scale.y*hatRecord.menuScale, z: scale.z*hatRecord.menuScale};;
            }

            // Create an invisible cube with a collider
            button = MRE.Actor.CreatePrimitive(this.assets, {
                definition: {
                    shape: MRE.PrimitiveShape.Box,
                    dimensions: { x: 1.4, y: 1.4, z: 1.4 } // make sure there's a gap
                },
                addCollider: true,
                actor: {
                    parentId: this.menu.id,
                    name: hatId,
                    transform: {
                        local: {
                            position: { x, y: 1, z: 0 },
                        }
                    },
                    appearance:{
                        materialId: this.invisibleMaterial.id
                    },
                    collider: {
                        geometry: { shape: MRE.ColliderType.Box },
                        layer: MRE.CollisionLayer.Hologram
                    }
                }
            });

            // Create a Artifact without a collider
            MRE.Actor.CreateFromLibrary(this.context, {
                resourceId: hatRecord.resourceId,
                actor: {
                    parentId: button.id,
                    appearance: {
                        enabled: (/!$/.test(hatId) ? true : new MRE.GroupMask(this.context, ['allowed']))
                    },
                    transform: {
                        local: {
                            position,
                            rotation: MRE.Quaternion.FromEulerAngles(
                                rotation.x * MRE.DegreesToRadians,
                                rotation.y * MRE.DegreesToRadians,
                                rotation.z * MRE.DegreesToRadians),
                            scale
                        },
                    }
                }
            });

            // Set a click handler on the button.
            button.setBehavior(MRE.ButtonBehavior).onClick(user => this.wearHat(hatId, user.id, user));

            x += this.previewMargin;
        }
    }

    /**
     * Instantiate a hat and attach it to the avatar's head.
     * @param hatId The id of the hat in the hat database.
     * @param userId The id of the user we will attach the hat to.
     */
    private async wearHat(hatId: string, userId: MRE.Guid, user: MRE.User) {

        let attachedHatScale = {x: 1, y: 1, z: 1};
        if (this.attachedHatIds.has(userId)){
            let hatRecord = this.HatDatabase[ this.attachedHatIds.get(userId)[this.attachedHatIds.get(userId).length -1] ];
            attachedHatScale = (hatRecord) ? (hatRecord.scale ? hatRecord.scale : {x: 3, y: 3, z: 3}) : { x: 3, y: 3, z: 3 };
        }
        // If the user selected 'clear', then early out.
        if (hatId == "clear!") {
            // If the user is wearing a hat, destroy it.
            if (this.attachedHats.has(userId)) {
                this.attachedHats.get(userId).pop().destroy();
	        this.attachedHatIds.get(userId).pop();
	    }
	    if (this.attachedHats.get(userId).length == 0) { 
                this.attachedHats.delete(userId); 
                this.attachedHatIds.delete(userId); 
	    }
            return;
        }
        else if (hatId == "moveup!") {
            if (this.attachedHats.has(userId))
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.position.y += 0.01;
            return;
        }
        else if (hatId == "movedown!") {
            if (this.attachedHats.has(userId))
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.position.y -= 0.01;
            return;
        }
        else if (hatId == "upup!") {
            if (this.attachedHats.has(userId))
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.position.y += 0.3;
            return;
        }
        else if (hatId == "downdown!") {
            if (this.attachedHats.has(userId))
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.position.y -= 0.3;
            return;
        }
        else if (hatId == "moveforward!") {
            if (this.attachedHats.has(userId))
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.position.z += 0.01;
            return;
        }
        else if (hatId == "moveback!") {
            if (this.attachedHats.has(userId))
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.position.z -= 0.01;
            return;
        }
        else if (hatId == "moveleft!") {
            if (this.attachedHats.has(userId))
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.position.x -= 0.01;
            return;
        }
        else if (hatId == "moveright!") {
            if (this.attachedHats.has(userId))
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.position.x += 0.01;
            return;
        }
        else if (hatId == "sizeup!") {
            if (this.attachedHats.has(userId)){
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.scale.x += 0.02*attachedHatScale.x;
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.scale.y += 0.02*attachedHatScale.y;
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.scale.z += 0.02*attachedHatScale.z;
            }
            return;
        }
        else if (hatId == "plusplus!") {
            if (this.attachedHats.has(userId)){
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.scale.x += 0.5*attachedHatScale.x;
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.scale.y += 0.5*attachedHatScale.y;
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.scale.z += 0.5*attachedHatScale.z;
            }
            return;
        }
        else if (hatId == "sizedown!") {
            if (this.attachedHats.has(userId)){
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.scale.x -= 0.02*attachedHatScale.x;
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.scale.y -= 0.02*attachedHatScale.y;
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.scale.z -= 0.02*attachedHatScale.z;
            }
            return;
        }
        else if (hatId == "minusminus!") {
            if (this.attachedHats.has(userId)){
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.scale.x -= 0.5*attachedHatScale.x;
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.scale.y -= 0.5*attachedHatScale.y;
                this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.scale.z -= 0.5*attachedHatScale.z;
            }
            return;
        }
        else if (hatId == "prev!") {
            if (this.helmetKitIndex > 0){
                this.menu.destroy();
                await this.loadKit( this.helmetKitsList[--this.helmetKitIndex] );
                this.showHatMenu();
            }
            return;
        }
        else if (hatId == "next!") {
            if (this.helmetKitIndex < this.helmetKitsList.length-1){
                this.menu.destroy();
                await this.loadKit( this.helmetKitsList[++this.helmetKitIndex] );
                this.showHatMenu();
            }
            if (this.attachedHats.has(userId)){
    	        console.log(this.attachedHats.get(userId)[this.attachedHats.get(userId).length-1].transform.local.toJSON());
            }
            return;
        }
        else if (hatId == "password!") {
            user.prompt("Password", true).then((dialog) => {
                if (dialog.submitted) {
                    if (dialog.text == password){
                        if (!user.groups.has('allowed')){
                            user.groups.add('allowed');
                        }
                    };
                }
            });
            return;
        }

        if (!user.groups.has('allowed')){
            return;
        }

        // If the user is wearing a hat, destroy it.
        // if (this.attachedHats.has(userId)) this.attachedHats.get(userId).destroy();
        // this.attachedHats.delete(userId);
        // this.attachedHatIds.delete(userId);

        // Create the hat model and attach it to the avatar's head.
        // Jimmy

        const hatRecord = this.HatDatabase[hatId];
        const position = hatRecord.position ? hatRecord.position : { x: 0, y: 0, z: 0 }
        const rotation = hatRecord.rotation ? hatRecord.rotation : { x: 0, y: 0, z: 0 }
        const scale = hatRecord.scale ? hatRecord.scale : { x: 1.5, y: 1.5, z: 1.5 }
        const attachPoint = <MRE.AttachPoint> (hatRecord.attachPoint ? hatRecord.attachPoint : 'head')

	let hat = MRE.Actor.CreateFromLibrary(this.context, {
	    resourceId: hatRecord.resourceId,
	    actor: {
		transform: {
		    local: {
			position: position,
			rotation: MRE.Quaternion.FromEulerAngles(
			    rotation.x * MRE.DegreesToRadians,
			    (rotation.y+180) * MRE.DegreesToRadians,
			    rotation.z * MRE.DegreesToRadians),
			scale: scale
		    }
		},
        appearance: {
            enabled: new MRE.GroupMask(this.context, ['allowed'])
        },
		attachment: {
		    attachPoint,
		    userId
		}
	    }
	});
	if (!this.attachedHats.has(userId)){
	    this.attachedHats.set(userId, [hat]);
            this.attachedHatIds.set(userId, [hatId]);
	} else {
	    this.attachedHats.get(userId).push(hat);
            this.attachedHatIds.get(userId).push(hatId);
	}
    }
}
