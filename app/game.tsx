"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import * as THREE from "three";

type ClassKey = "INFANTRY" | "LIGHT" | "MEDIUM" | "HEAVY" | "SCOUT";
type ClassSpec = { label: string; weapon: string; speed: number; damage: number; rate: number; range: number; color: number };

const CLASSES: Record<ClassKey, ClassSpec> = {
  INFANTRY: { label: "Infantry", weapon: "M4 Service Rifle", speed: 8, damage: 30, rate: 180, range: 105, color: 0x8db078 },
  LIGHT: { label: "Light", weapon: "Viper SMG", speed: 10.5, damage: 18, rate: 85, range: 60, color: 0xe3c775 },
  MEDIUM: { label: "Medium", weapon: "AR-7 Assault Rifle", speed: 8.7, damage: 25, rate: 120, range: 90, color: 0xcb825d },
  HEAVY: { label: "Heavy", weapon: "M134 Minigun", speed: 6.1, damage: 13, rate: 55, range: 80, color: 0x9c876e },
  SCOUT: { label: "Scout", weapon: "Longshot M2", speed: 8.3, damage: 95, rate: 650, range: 180, color: 0x7896a8 },
};

const CLASS_KEYS = Object.keys(CLASSES) as ClassKey[];
const DIFFICULTIES = { RECRUIT: { aim: .18, fire: 1.65 }, REGULAR: { aim: .11, fire: 1.15 }, VETERAN: { aim: .055, fire: .78 } };

type Bot = { mesh: THREE.Group; team: "RED" | "BLUE"; hp: number; target: THREE.Vector3; cooldown: number; skill: keyof typeof DIFFICULTIES; classKey: ClassKey; bar: THREE.Mesh; muzzleFlash: THREE.Group; dying?: boolean; deathStarted?: number; fallDirection?: number };
type Point = { mesh: THREE.Group; letter: string; owner: "RED" | "BLUE" | "NEUTRAL"; progress: number; pos: THREE.Vector3 };

export default function Game() {
  const mount = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<ClassKey>("INFANTRY");
  const difficultyRef = useRef<keyof typeof DIFFICULTIES>("REGULAR");
  const [selected, setSelected] = useState<ClassKey>("INFANTRY");
  const [difficulty, setDifficulty] = useState<keyof typeof DIFFICULTIES>("REGULAR");
  const [killNotice, setKillNotice] = useState("");
  const [screen, setScreen] = useState<"loadout" | "playing" | "dead">("loadout");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [hud, setHud] = useState({ hp: 200, red: 0, blue: 0, ammo: 30, stance: "STANDING", points: ["NEUTRAL", "NEUTRAL", "NEUTRAL"] });
  const gameRef = useRef<{ start: () => void } | null>(null);

  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);

  useEffect(() => {
    if (!mount.current) return;
    const root = mount.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x73878a);
    scene.fog = new THREE.FogExp2(0x718287, .0065);
    const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .08, 450);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const laptopMode=innerWidth<=1600||innerHeight<=900;
    renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, laptopMode?1.25:1.7));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    root.appendChild(renderer.domElement);
    const weaponRig=document.createElement("div");weaponRig.className="weapon-rig";const m4Overlay=document.createElement("img");m4Overlay.className="m4-animation";m4Overlay.alt="Held service rifle";m4Overlay.src="/m4-frames/frame-001.png";weaponRig.appendChild(m4Overlay);for(const position of ["front","rear"]){const arm=document.createElement("div");arm.className=`weapon-arm ${position}-arm`;const hand=document.createElement("div");hand.className=`weapon-hand ${position}-hand`;weaponRig.append(arm,hand);}root.appendChild(weaponRig);const sniperScope=document.createElement("div");sniperScope.className="sniper-scope";const scopeLens=document.createElement("div");scopeLens.className="scope-lens";const scopeDot=document.createElement("i");scopeLens.appendChild(scopeDot);for(const [label,cls] of [["1","range-one"],["2","range-two"],["3","range-three"],["4","range-four"]]){const mark=document.createElement("span");mark.textContent=label;mark.className=cls;scopeLens.appendChild(mark);}sniperScope.appendChild(scopeLens);root.appendChild(sniperScope);for(let i=1;i<=27;i++){const preload=new Image();preload.src=`/m4-frames/frame-${String(i).padStart(3,"0")}.png`;}
    const reflexScope=document.createElement("div");reflexScope.className="reflex-scope";const reflexLens=document.createElement("div");reflexLens.className="reflex-lens";reflexScope.appendChild(reflexLens);root.appendChild(reflexScope);

    scene.add(new THREE.HemisphereLight(0xbdd7df, 0x303629, 1.5));
    const sun = new THREE.DirectionalLight(0xffe1b2, 3.2); sun.position.set(-50, 75, 35); sun.castShadow = true;
    sun.shadow.mapSize.set(laptopMode?1024:2048,laptopMode?1024:2048); sun.shadow.camera.left = -120; sun.shadow.camera.right = 120; sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120; scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320, 40, 40), new THREE.MeshStandardMaterial({ color: 0x39483a, roughness: .93 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const grid = new THREE.GridHelper(320, 64, 0x61715d, 0x455443); grid.position.y = .02; (grid.material as THREE.Material).opacity = .18; (grid.material as THREE.Material).transparent = true; scene.add(grid);

    const obstacles: THREE.Object3D[] = [];
    const obstacleBounds: THREE.Box3[] = [];
    const treeTexture = new THREE.TextureLoader().load(new URL("tree-prop.png", document.baseURI).toString()); treeTexture.colorSpace = THREE.SRGBColorSpace;
    const treeMaterial = new THREE.MeshStandardMaterial({map:treeTexture,transparent:true,alphaTest:.08,side:THREE.DoubleSide,roughness:.95,metalness:0});
    const addBox = (x:number,z:number,w:number,h:number,d:number) => {
      const treeWidth=Math.max(7,Math.min(22,w*1.15)),treeHeight=treeWidth/1.89,tree=new THREE.Group();
      for(const rotation of [0,Math.PI/2]){const plane=new THREE.Mesh(new THREE.PlaneGeometry(treeWidth,treeHeight),treeMaterial.clone());plane.rotation.y=rotation;plane.castShadow=true;plane.receiveShadow=true;tree.add(plane);}
      tree.position.set(x,treeHeight/2,z);tree.rotation.y=((x*13+z*7)%360)*Math.PI/180;scene.add(tree);obstacles.push(tree);
      obstacleBounds.push(new THREE.Box3(new THREE.Vector3(x-w/2-.42,0,z-d/2-.42),new THREE.Vector3(x+w/2+.42,treeHeight,z+d/2+.42)));
    };
    [[-26,-10,20,6,8],[28,12,22,5,9],[-5,34,10,9,18],[9,-35,11,7,16],[-48,29,16,4,8],[47,-28,18,4,9]].forEach(v=>addBox(...(v as [number,number,number,number,number])));
    for(let i=0;i<26;i++){const a=i/26*Math.PI*2,r=70+(i%4)*12;addBox(Math.sin(a)*r,Math.cos(a)*r,2+(i%3),2.2,7);}

    const isBlocked = (x:number,z:number,radius=.42) => x < -159 + radius || x > 159 - radius || z < -159 + radius || z > 159 - radius || obstacleBounds.some(bounds => x > bounds.min.x - radius && x < bounds.max.x + radius && z > bounds.min.z - radius && z < bounds.max.z + radius);
    const moveBot = (bot:Bot, delta:THREE.Vector3) => {
      const oldX=bot.mesh.position.x,oldZ=bot.mesh.position.z;
      const nextX=oldX+delta.x,nextZ=oldZ+delta.z;
      if(!isBlocked(nextX,nextZ,.58)){bot.mesh.position.x=nextX;bot.mesh.position.z=nextZ;return;}
      if(!isBlocked(nextX,oldZ,.58)){bot.mesh.position.x=nextX;return;}
      if(!isBlocked(oldX,nextZ,.58)){bot.mesh.position.z=nextZ;}
    };
    const makeMuzzleFlash = (size=.16) => {
      const flash=new THREE.Group(); flash.name="muzzle-flash"; flash.visible=false;
      const material=new THREE.MeshBasicMaterial({color:0xffc24a,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
      const core=new THREE.Mesh(new THREE.ConeGeometry(size*.58,size*2.8,7),material); core.rotation.x=Math.PI/2; core.position.z=size*1.25;
      const glow=new THREE.Mesh(new THREE.SphereGeometry(size*.62,8,6),material.clone());
      const light=new THREE.PointLight(0xffa52f,0,4);
      flash.add(core,glow,light); flash.userData.materials=[material,glow.material]; flash.userData.light=light; flash.userData.flashUntil=0; flash.userData.size=size;
      return flash;
    };
    const triggerMuzzleFlash = (flash:THREE.Group, now:number) => { flash.visible=true; flash.userData.flashUntil=now+82; flash.scale.setScalar(.9+Math.random()*.25); (flash.userData.light as THREE.PointLight).intensity=4.2; for(const material of flash.userData.materials as THREE.MeshBasicMaterial[])material.opacity=1; setTimeout(()=>{if((flash.userData.flashUntil as number)<=performance.now())flash.visible=false},90); };
    const updateMuzzleFlash = (flash:THREE.Group, now:number) => { const remaining=(flash.userData.flashUntil as number)-now;if(remaining<=0){flash.visible=false;return;}const t=remaining/82;flash.scale.setScalar(.7+t*.75);(flash.userData.light as THREE.PointLight).intensity=4.2*t;for(const material of flash.userData.materials as THREE.MeshBasicMaterial[])material.opacity=Math.min(1,t*1.8); };

    const points: Point[] = [[-42,0,"A"],[0,3,"B"],[42,0,"C"]].map(([x,z,l])=>{
      const g=new THREE.Group(); const ring=new THREE.Mesh(new THREE.RingGeometry(7.5,8,48),new THREE.MeshBasicMaterial({color:0xd5d1b9,side:THREE.DoubleSide,transparent:true,opacity:.55}));ring.rotation.x=-Math.PI/2;g.add(ring);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,8),new THREE.MeshStandardMaterial({color:0x9da4a1}));pole.position.y=4;g.add(pole);
      const flag=new THREE.Mesh(new THREE.PlaneGeometry(3.5,1.8),new THREE.MeshStandardMaterial({color:0xddd9c6,side:THREE.DoubleSide}));flag.position.set(1.8,6.8,0);g.add(flag);g.position.set(x as number,.04,z as number);scene.add(g);
      return {mesh:g,letter:l as string,owner:"NEUTRAL",progress:0,pos:new THREE.Vector3(x as number,0,z as number)};
    });

    const bots: Bot[]=[];
    function botMesh(team:"RED"|"BLUE", classKey:ClassKey){
      const g=new THREE.Group(),teamColor=team==="RED"?0xb5222d:0x176fbd;
      const uniform=new THREE.MeshStandardMaterial({color:teamColor,roughness:.68}),dark=new THREE.MeshStandardMaterial({color:0x151b1c,roughness:.52,metalness:.12}),armor=new THREE.MeshStandardMaterial({color:team==="RED"?0x721921:0x164a76,roughness:.54}),skin=new THREE.MeshStandardMaterial({color:0xa97a59,roughness:.8});
      const part=(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m};
      part(new THREE.BoxGeometry(.82,.88,.4),uniform,0,1.48,0);
      const vest=part(new THREE.BoxGeometry(.9,.68,.48),armor,0,1.52,.01);for(let i=-1;i<=1;i++)part(new THREE.BoxGeometry(.2,.25,.12),armor,i*.25,1.38,.29);
      part(new THREE.BoxGeometry(.68,.18,.42),dark,0,1.02,0);
      for(const x of [-.23,.23]){const thigh=part(new THREE.CapsuleGeometry(.17,.45,4,8),uniform,x,.72,0);const shin=part(new THREE.CapsuleGeometry(.15,.4,4,8),uniform,x,.27,0);part(new THREE.BoxGeometry(.3,.22,.48),dark,x,.08,.09);part(new THREE.BoxGeometry(.3,.16,.14),armor,x,.48,.17);thigh.userData.limb=true;shin.userData.limb=true;}
      const head=part(new THREE.SphereGeometry(.29,16,12),skin,0,2.14,0);head.scale.set(.92,1.05,.92);const helmet=part(new THREE.SphereGeometry(.32,16,10,0,Math.PI*2,0,Math.PI*.62),uniform,0,2.23,0);const visor=part(new THREE.BoxGeometry(.48,.13,.09),dark,0,2.17,.27);part(new THREE.BoxGeometry(.58,.1,.18),armor,0,1.91,0);head.userData.head=true;helmet.userData.head=true;visor.userData.head=true;
      for(const x of [-.53,.53]){part(new THREE.SphereGeometry(.2,10,8),armor,x,1.75,0);const arm=part(new THREE.CapsuleGeometry(.12,.55,4,8),uniform,x,1.55,.25);arm.rotation.x=Math.PI*.42;arm.rotation.z=x<0?-.1:.1;part(new THREE.SphereGeometry(.14,10,8),dark,x,1.29,.57);}
      const weapon=part(new THREE.BoxGeometry(.16,.18,1.28),dark,.16,1.42,.75);part(new THREE.BoxGeometry(.13,.34,.18),dark,.16,1.24,.68);part(new THREE.CylinderGeometry(.035,.035,.72,8),dark,.16,1.43,1.72).rotation.x=Math.PI/2;
      const muzzleFlash=makeMuzzleFlash(.14);muzzleFlash.position.set(.16,1.43,2.13);muzzleFlash.rotation.y=Math.PI;g.add(muzzleFlash);
      vest.userData.team=team;weapon.userData.weapon=classKey;
      const bg=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.12),new THREE.MeshBasicMaterial({color:0x1c211e,side:THREE.DoubleSide}));bg.position.set(0,2.75,0);g.add(bg);const bar=new THREE.Mesh(new THREE.PlaneGeometry(1.16,.08),new THREE.MeshBasicMaterial({color:team==="RED"?0xf05a4a:0x58a9ef,side:THREE.DoubleSide}));bar.position.set(0,2.75,.005);g.add(bar);return {g,bar,muzzleFlash};
    }
    function spawnBots(){bots.splice(0).forEach(()=>{});for(let i=0;i<14;i++){const team=i<8?"RED":"BLUE", cm=botMesh(team,CLASS_KEYS[i%5]);cm.g.position.set(team==="RED"?-75+Math.random()*12:70+Math.random()*12,0,(Math.random()-.5)*70);scene.add(cm.g);bots.push({mesh:cm.g,bar:cm.bar,muzzleFlash:cm.muzzleFlash,team,hp:200,target:points[i%3].pos.clone(),cooldown:Math.random(),skill:difficultyRef.current,classKey:CLASS_KEYS[i%5]});}}

    const keys=new Set<string>(); let yaw=0,pitch=0,velocityY=0,onGround=true,hp=200,lastShot=0,ammo=30,reloading=false,reloadStarted=0,playing=false,red=0,blue=0,shake=0,hitFlash=0;
    const player=new THREE.Vector3(72,1.72,0); camera.position.copy(player);
    const gun=new THREE.Group(),weaponModels={} as Record<ClassKey,THREE.Group>;const gunMetal=new THREE.MeshStandardMaterial({color:0x697679,metalness:.5,roughness:.38,emissive:0x171b1c,emissiveIntensity:.48}),gunDark=new THREE.MeshStandardMaterial({color:0x343d40,metalness:.3,roughness:.54,emissive:0x111516,emissiveIntensity:.42}),gripMat=new THREE.MeshStandardMaterial({color:0x303833,roughness:.8,emissive:0x0b0e0c,emissiveIntensity:.3}),handMat=new THREE.MeshStandardMaterial({color:0xb98562,roughness:.82}),sleeveMat=new THREE.MeshStandardMaterial({color:0x30483b,roughness:.9});
    const makeViewWeapon=(key:ClassKey)=>{const w=new THREE.Group();const box=(sx:number,sy:number,sz:number,x:number,y:number,z:number,mat:THREE.Material=gunMetal)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);m.position.set(x,y,z);m.castShadow=true;w.add(m);return m};const tube=(radius:number,length:number,x:number,y:number,z:number,mat:THREE.Material=gunDark)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,10),mat);m.rotation.x=Math.PI/2;m.position.set(x,y,z);m.castShadow=true;w.add(m);return m};
      let magazine:THREE.Mesh;
      if(key==="LIGHT"){box(.3,.24,.72,.25,-.28,-.72);tube(.045,.5,.25,-.25,-1.32);magazine=box(.14,.42,.16,.25,-.49,-.66,gripMat);box(.08,.18,.56,.25,-.27,-.2,gunDark);}
      else if(key==="MEDIUM"){box(.32,.25,.78,.25,-.28,-.72);box(.25,.22,.58,.25,-.26,-1.35,gunDark);tube(.045,.75,.25,-.25,-2);box(.18,.46,.2,.25,-.51,-.77,gripMat).rotation.x=-.18;magazine=box(.14,.38,.22,.25,-.46,-1.02,gunDark);magazine.rotation.x=.2;}
      else if(key==="HEAVY"){tube(.24,.65,.22,-.25,-.67,gunMetal);for(let i=0;i<6;i++){const a=i/6*Math.PI*2;tube(.035,1.35,.22+Math.cos(a)*.14,-.25+Math.sin(a)*.14,-1.65,gunDark);}tube(.29,.18,.22,-.25,-1.05,gunMetal);tube(.22,.16,.22,-.25,-2.28,gunMetal);box(.28,.18,.38,.22,-.47,-.49,gripMat);magazine=box(.34,.38,.42,.22,-.47,-.18,gunDark);}
      else if(key==="SCOUT"){box(.28,.24,1.08,.25,-.28,-.92);tube(.04,1.35,.25,-.25,-2.08);magazine=box(.2,.38,.22,.25,-.48,-.72,gripMat);box(.12,.16,.7,.25,-.29,-.18,gripMat);tube(.105,.58,.25,-.08,-.86,gunDark);tube(.055,.22,.25,-.08,-1.25,gunDark);}
      else{box(.32,.25,.9,.25,-.28,-.78);box(.25,.21,.58,.25,-.26,-1.48,gunDark);tube(.045,.72,.25,-.25,-2.1);box(.18,.45,.2,.25,-.5,-.82,gripMat).rotation.x=-.18;magazine=box(.14,.38,.22,.25,-.45,-1.08,gunDark);magazine.rotation.x=.18;box(.13,.08,.18,.25,-.1,-.6,gunDark);}
      if(key==="MEDIUM"||key==="INFANTRY"){const stock=box(.18,.16,.48,.25,-.29,-.16,gripMat);stock.rotation.x=-.04;box(.24,.07,.15,.25,-.25,.12,gunDark);}
      magazine.userData.magazine=true;magazine.userData.restPosition=magazine.position.clone();magazine.userData.restRotation=magazine.rotation.clone();
      const sightZ=key==="SCOUT"?-.55:key==="HEAVY"?-.42:-.38,sightSize=key==="HEAVY"?.075:key==="LIGHT"?.065:.085;const sight=new THREE.Mesh(new THREE.TorusGeometry(sightSize,.012,8,18),gunDark);sight.position.set(.25,-.1,sightZ);sight.userData.sight=true;w.add(sight);const sightDotMaterial=new THREE.MeshBasicMaterial({color:0xe65b43,transparent:true,opacity:.2,depthWrite:false});const sightDot=new THREE.Mesh(new THREE.SphereGeometry(.008,6,4),sightDotMaterial);sightDot.position.set(.25,-.1,sightZ+.006);sightDot.userData.sight=true;sightDot.renderOrder=4;w.add(sightDot);const opticStem=box(.035,.16,.035,.25,-.19,sightZ,gunDark);const opticRail=box(.18,.035,.22,.25,-.275,sightZ,gunDark);opticStem.userData.opticMount=true;opticRail.userData.opticMount=true;
      const rearHand=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),handMat);rearHand.position.set(.25,-.42,-.5);rearHand.scale.set(.9,1.15,.9);rearHand.userData.hands=true;w.add(rearHand);const supportHand=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),handMat);supportHand.position.set(-.02,-.37,-1.18);supportHand.scale.set(1.1,.85,1);supportHand.userData.hands=true;supportHand.userData.reloadHand=true;supportHand.userData.restPosition=supportHand.position.clone();w.add(supportHand);const sleeveA=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.46,4,8),sleeveMat);sleeveA.position.set(.36,-.58,-.2);sleeveA.rotation.x=.75;sleeveA.userData.hands=true;w.add(sleeveA);const sleeveB=sleeveA.clone();sleeveB.position.set(-.18,-.56,-.83);sleeveB.rotation.x=1.05;sleeveB.userData.reloadHand=true;sleeveB.userData.restPosition=sleeveB.position.clone();w.add(sleeveB);
      const muzzleZ=key==="HEAVY"?-2.4:key==="SCOUT"?-2.78:key==="LIGHT"?-1.62:key==="MEDIUM"?-2.48:-2.52;const muzzleFlash=makeMuzzleFlash(key==="HEAVY"?.2:.16);muzzleFlash.position.set(.25,-.25,muzzleZ);muzzleFlash.rotation.y=Math.PI;muzzleFlash.userData.muzzleFlash=true;w.add(muzzleFlash);w.userData.muzzleFlash=muzzleFlash;
      w.position.set(.1,.03,0);return w;};
    const weaponFlashes={} as Record<ClassKey,THREE.Group>;for(const key of CLASS_KEYS){weaponModels[key]=makeViewWeapon(key);weaponFlashes[key]=weaponModels[key].userData.muzzleFlash as THREE.Group;weaponModels[key].visible=false;gun.add(weaponModels[key]);}camera.add(gun);const viewLight=new THREE.PointLight(0xe7f0e8,4.5,7);viewLight.position.set(0,.6,.65);camera.add(viewLight);scene.add(camera);
    const ray=new THREE.Raycaster();
    let audio: AudioContext | null = null;
    const shotSound=()=>{audio??=new AudioContext();if(audio.state==="suspended")audio.resume();const t=audio.currentTime,key=selectedRef.current;const cfg=key==="HEAVY"?[115,.055,.22]:key==="SCOUT"?[72,.22,.58]:key==="LIGHT"?[210,.07,.22]:[145,.11,.34];const osc=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter();osc.type="sawtooth";osc.frequency.setValueAtTime(cfg[0],t);osc.frequency.exponentialRampToValueAtTime(38,t+cfg[1]);filter.type="lowpass";filter.frequency.value=key==="SCOUT"?850:1500;gain.gain.setValueAtTime(cfg[2],t);gain.gain.exponentialRampToValueAtTime(.001,t+cfg[1]);osc.connect(filter).connect(gain).connect(audio.destination);osc.start(t);osc.stop(t+cfg[1]);const length=Math.max(1,Math.floor(audio.sampleRate*cfg[1])),buffer=audio.createBuffer(1,length,audio.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length);const noise=audio.createBufferSource(),noiseGain=audio.createGain();noise.buffer=buffer;noiseGain.gain.setValueAtTime(key==="SCOUT"?.6:.24,t);noiseGain.gain.exponentialRampToValueAtTime(.001,t+cfg[1]);noise.connect(noiseGain).connect(audio.destination);noise.start(t);};
    const shoot=()=>{
      if(!playing||reloading)return;const classKey=selectedRef.current,spec=CLASSES[classKey];
      if(performance.now()-lastShot<spec.rate||ammo<=0)return;const shotAt=performance.now();lastShot=shotAt;ammo--;shotSound();triggerMuzzleFlash(weaponFlashes[classKey],shotAt);gun.position.z=.08;
      ray.setFromCamera(new THREE.Vector2(0,0),camera);ray.far=spec.range;
      const hits=ray.intersectObjects(bots.filter(b=>b.team==="RED"&&!b.dying).map(b=>b.mesh),true),wallHits=ray.intersectObjects(obstacles,true);
      if(hits.length&&(!wallHits.length||hits[0].distance<wallHits[0].distance)){
        const hitObject=hits[0].object,bot=bots.find(b=>{let o:THREE.Object3D|null=hitObject;while(o?.parent&&o.parent!==scene)o=o.parent;return o===b.mesh;});
        if(bot){const headshot=classKey==="SCOUT"&&Boolean(hitObject.userData.head);bot.hp=headshot?0:bot.hp-spec.damage;bot.bar.scale.x=Math.max(.01,bot.hp/200);bot.bar.position.x=-(1-bot.hp/200)*.58;if(bot.hp<=0&&!bot.dying){bot.dying=true;bot.deathStarted=performance.now();bot.fallDirection=Math.random()<.5?-1:1;bot.bar.visible=false;setKillNotice(headshot?"HEADSHOT â€” INSTANT KILL":"ENEMY KILLED");setTimeout(()=>setKillNotice(""),850);setTimeout(()=>{scene.remove(bot.mesh);const idx=bots.indexOf(bot);if(idx>=0)bots.splice(idx,1);if(playing)spawnOne("RED")},1250);}}
      }
      if(ammo===0)reload();
    };
    function reload(){if(reloading)return;reloading=true;aiming=false;reloadStarted=performance.now();setTimeout(()=>{ammo=selectedRef.current==="HEAVY"?100:selectedRef.current==="SCOUT"?5:30;reloading=false},1300);}
    function spawnOne(team:"RED"|"BLUE"){const classKey=CLASS_KEYS[Math.floor(Math.random()*5)],cm=botMesh(team,classKey);cm.g.position.set(team==="RED"?-72:72,0,(Math.random()-.5)*65);scene.add(cm.g);bots.push({mesh:cm.g,bar:cm.bar,muzzleFlash:cm.muzzleFlash,team,hp:200,target:points[Math.floor(Math.random()*3)].pos.clone(),cooldown:1,skill:difficultyRef.current,classKey});}

    const down=(e:KeyboardEvent)=>{keys.add(e.code);if(e.code==="KeyR")reload();if(e.code==="KeyQ"&&!e.repeat)aiming=!aiming;if(e.code==="F11"){e.preventDefault();if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{});}if(e.code==="Space"&&onGround){velocityY=7;onGround=false}};const up=(e:KeyboardEvent)=>keys.delete(e.code);
    let lastMouseX:number|null=null,lastMouseY:number|null=null,aiming=false;
    const move=(e:MouseEvent)=>{if(!playing){lastMouseX=e.clientX;lastMouseY=e.clientY;return;}const locked=document.pointerLockElement===renderer.domElement;const dx=locked?e.movementX:(lastMouseX===null?0:e.clientX-lastMouseX);const dy=locked?e.movementY:(lastMouseY===null?0:e.clientY-lastMouseY);lastMouseX=e.clientX;lastMouseY=e.clientY;yaw-=dx*.0028;pitch=Math.max(-1.45,Math.min(1.45,pitch-dy*.0028));};
    const tryPointerLock=()=>{try{const attempt=renderer.domElement.requestPointerLock();attempt?.catch?.(()=>{});}catch{/* Mouse-look fallback remains active. */}};
    const click=(e:MouseEvent)=>{if(!playing)return;tryPointerLock();if(e.button===2){aiming=true;return;}if(e.button===0){keys.add("Mouse0");shoot();}};const mouseUp=(e:MouseEvent)=>{if(e.button===2)aiming=false;if(e.button===0)keys.delete("Mouse0")};const stopMenu=(e:MouseEvent)=>e.preventDefault();
    addEventListener("keydown",down);addEventListener("keyup",up);addEventListener("mousemove",move);addEventListener("mouseup",mouseUp);renderer.domElement.addEventListener("mousedown",click);renderer.domElement.addEventListener("contextmenu",stopMenu);
    const resize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)};addEventListener("resize",resize);

    gameRef.current={start:()=>{bots.forEach(b=>scene.remove(b.mesh));bots.length=0;spawnBots();player.set(72,1.72,0);hp=200;ammo=selectedRef.current==="HEAVY"?100:selectedRef.current==="SCOUT"?5:30;red=blue=0;points.forEach(p=>{p.owner="NEUTRAL";p.progress=0});playing=true;setScreen("playing");tryPointerLock();}};
    let prev=performance.now(), hudTick=0;
    function animate(now:number){requestAnimationFrame(animate);const dt=Math.min(.035,(now-prev)/1000);prev=now;gun.position.z*=.78;const classKey=selectedRef.current,sniperAiming=playing&&aiming&&classKey==="SCOUT",targetFov=aiming?(sniperAiming?24:43):72;if(Math.abs(camera.fov-targetFov)>.05){camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*13);camera.updateProjectionMatrix();}const adsAmount=Math.min(1,dt*14);gun.position.x+=((aiming&&!sniperAiming?-.35:0)-gun.position.x)*adsAmount;gun.position.y+=((aiming&&!sniperAiming?.07:0)-gun.position.y)*adsAmount;gun.visible=playing&&!sniperAiming;for(const key of CLASS_KEYS)weaponModels[key].visible=key===classKey;const activeWeapon=weaponModels[classKey],reloadT=reloading?Math.min(1,(now-reloadStarted)/1300):0,reloadWave=reloading?Math.sin(reloadT*Math.PI):0;activeWeapon.rotation.set(reloading?-.18*reloadWave:0,reloading?.1*reloadWave:0,reloading?.24*reloadWave:0);activeWeapon.position.set(.1+(reloading?.08*reloadWave:0),.03-(reloading?.18*reloadWave:0),reloading?.12*reloadWave:0);activeWeapon.traverse(o=>{if((o as THREE.Mesh).isMesh)o.visible=!(aiming&&o.userData.hands);if(o.userData.magazine){const rest=o.userData.restPosition as THREE.Vector3;o.position.copy(rest);o.rotation.copy(o.userData.restRotation as THREE.Euler);if(reloading){const travel=reloadT<.48?Math.min(1,reloadT/.32):Math.max(0,1-(reloadT-.48)/.3);o.position.y-=.62*travel;o.position.x-=.16*travel;o.rotation.z+=.28*travel;}}else if(o.userData.reloadHand){const rest=o.userData.restPosition as THREE.Vector3;o.position.copy(rest);if(reloading){const reach=Math.sin(Math.min(1,reloadT/.8)*Math.PI);o.position.y-=.38*reach;o.position.x+=.12*reach;o.position.z+=.18*reach;}}});weaponRig.style.display="none";sniperScope.style.display=sniperAiming?"block":"none";root.parentElement?.classList.toggle("sniper-aiming",sniperAiming);if(playing){
      activeWeapon.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;if(!o.userData.adsRestScale)o.userData.adsRestScale=o.scale.clone();o.scale.copy(o.userData.adsRestScale as THREE.Vector3);if(aiming&&!o.userData.sight&&!o.userData.opticMount){o.scale.x*=.74;if(!o.userData.magazine)o.scale.y*=.82;}});
      activeWeapon.scale.setScalar(aiming?.62:1);
      if(aiming){const adsYaw=-.03,adsSightZ=classKey==="SCOUT"?-.55:classKey==="HEAVY"?-.42:-.38,adsSightX=.25*Math.cos(adsYaw)+adsSightZ*Math.sin(adsYaw);activeWeapon.rotation.y=adsYaw;gun.position.set(-(.1+.62*adsSightX),.032,-1.45);}
      if(aiming)gun.visible=false;
      reflexScope.style.display=aiming&&!sniperAiming?"block":"none";
      const beforeMoveX=player.x,beforeMoveZ=player.z;
      const stance=keys.has("KeyZ")?"PRONE":keys.has("ControlLeft")?"CROUCHED":"STANDING";const targetH=stance==="PRONE"?.55:stance==="CROUCHED"?1.1:1.72;player.y+=((onGround?targetH:player.y)-player.y)*Math.min(1,dt*9);const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),r=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));const dir=new THREE.Vector3();if(keys.has("KeyW"))dir.add(f);if(keys.has("KeyS"))dir.sub(f);if(keys.has("KeyD"))dir.add(r);if(keys.has("KeyA"))dir.sub(r);const base=CLASSES[selectedRef.current].speed*(keys.has("ShiftLeft")?1.55:1)*(stance==="CROUCHED"?.55:stance==="PRONE"?.28:1);if(dir.lengthSq())player.addScaledVector(dir.normalize(),base*dt);player.x=Math.max(-152,Math.min(152,player.x));player.z=Math.max(-152,Math.min(152,player.z));if(!onGround){velocityY-=18*dt;player.y+=velocityY*dt;if(player.y<=targetH){player.y=targetH;velocityY=0;onGround=true}}camera.rotation.set(pitch,yaw,0,"YXZ");camera.position.copy(player);if(shake>0){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake*=.9;}
      if(obstacleBounds.some(bounds=>player.x>bounds.min.x&&player.x<bounds.max.x&&player.z>bounds.min.z&&player.z<bounds.max.z)){player.x=beforeMoveX;player.z=beforeMoveZ;camera.position.copy(player);}
      if(keys.has("Mouse0"))shoot();
      bots.forEach(bot=>{updateMuzzleFlash(bot.muzzleFlash,now);if(bot.dying){const deathT=Math.min(1,(now-(bot.deathStarted??now))/900),ease=1-Math.pow(1-deathT,3);bot.mesh.rotation.z=(bot.fallDirection??1)*ease*1.45;bot.mesh.position.y=-ease*.32;return;}const enemy=bot.team==="RED"?player:null;const toTarget=bot.target.clone().sub(bot.mesh.position);const nearPlayer=bot.team==="RED"&&bot.mesh.position.distanceTo(player)<48;if(nearPlayer&&enemy){toTarget.copy(player).sub(bot.mesh.position)}toTarget.y=0;if(toTarget.length()>3){const step=toTarget.normalize().multiplyScalar(dt*(bot.classKey==="LIGHT"?5.2:3.7));moveBot(bot,step);const lookStep=new THREE.Vector3(step.x,0,step.z);if(lookStep.lengthSq()>0)bot.mesh.lookAt(bot.mesh.position.clone().add(lookStep));}bot.bar.lookAt(camera.position);bot.cooldown-=dt;if(nearPlayer&&bot.cooldown<=0){const d=DIFFICULTIES[bot.skill];bot.cooldown=d.fire+Math.random()*.5;const dist=bot.mesh.position.distanceTo(player);triggerMuzzleFlash(bot.muzzleFlash,now);const shotOrigin=bot.mesh.position.clone();shotOrigin.y=1.55;const shotTarget=player.clone();shotTarget.y=Math.max(1.1,player.y);const shotVector=shotTarget.sub(shotOrigin);const shotDistance=shotVector.length();ray.set(shotOrigin,shotVector.normalize());ray.far=shotDistance;const wall=ray.intersectObjects(obstacles,true)[0];const clearShot=!wall||wall.distance>=shotDistance-.45;const hitChance=Math.max(.08,.84-dist*.012-d.aim);if(clearShot&&Math.random()<hitChance){hp-=bot.classKey==="SCOUT"?34:bot.classKey==="HEAVY"?12:20;shake=.13;hitFlash=1;if(hp<=0){hp=0;playing=false;document.exitPointerLock();setScreen("dead");}}}});
      points.forEach(p=>{let influence=player.distanceTo(p.pos)<8?1:0;bots.forEach(b=>{if(b.mesh.position.distanceTo(p.pos)<8)influence+=b.team==="BLUE"?1:-1});if(influence!==0){p.progress=Math.max(-100,Math.min(100,p.progress+influence*dt*12));if(p.progress>=100)p.owner="BLUE";else if(p.progress<=-100)p.owner="RED";else p.owner="NEUTRAL";}const c=p.owner==="BLUE"?0x3f9ae0:p.owner==="RED"?0xd84c3f:0xd5d1b9;((p.mesh.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(c);((p.mesh.children[2] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(c);});
      red+=points.filter(p=>p.owner==="RED").length*dt;blue+=points.filter(p=>p.owner==="BLUE").length*dt;hitFlash*=.88;
      if(now-hudTick>100){hudTick=now;setHud({hp:Math.ceil(hp),red:Math.floor(red),blue:Math.floor(blue),ammo,stance,points:points.map(p=>p.owner)});}
    }renderer.render(scene,camera)}animate(prev);
    return()=>{playing=false;removeEventListener("keydown",down);removeEventListener("keyup",up);removeEventListener("mousemove",move);removeEventListener("mouseup",mouseUp);removeEventListener("resize",resize);renderer.domElement.removeEventListener("contextmenu",stopMenu);root.parentElement?.classList.remove("sniper-aiming");audio?.close();renderer.dispose();root.removeChild(renderer.domElement);root.removeChild(weaponRig);root.removeChild(sniperScope);root.removeChild(reflexScope)};
  },[]);

  const launch=()=>gameRef.current?.start();
  const sendFeedback=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const data=new FormData(event.currentTarget),category=String(data.get("category")||"Bug"),description=String(data.get("description")||""),steps=String(data.get("steps")||"Not provided");const subject=encodeURIComponent(`[FRONTLINE ${category}] Player feedback`),body=encodeURIComponent(`Bug type: ${category}\nClass: ${CLASSES[selected].label}\nScreen: ${screen}\n\nDescription:\n${description}\n\nSteps to reproduce:\n${steps}\n\nGame build: 0.1`);window.location.href=`mailto:chibachaseygaming@gmail.com?subject=${subject}&body=${body}`;setFeedbackOpen(false)};
  return <main className={`game-shell ${screen==="playing"?"playing":""}`}>
    <div ref={mount} className="viewport" />
    <button className="feedback-button" onClick={()=>setFeedbackOpen(true)}>FEEDBACK</button>
    {feedbackOpen&&<div className="feedback-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setFeedbackOpen(false)}}><section className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title"><button className="feedback-close" aria-label="Close feedback" onClick={()=>setFeedbackOpen(false)}>Ã—</button><span>REPORT TO COMMAND</span><h2 id="feedback-title">SEND FEEDBACK</h2><p>Tell us what went wrong. Your email app will open with the report addressed to the developer.</p><form onSubmit={sendFeedback}><label>BUG TYPE<select name="category"><option>Gameplay bug</option><option>Controls</option><option>Graphics</option><option>Audio</option><option>Performance</option><option>Other</option></select></label><label>WHAT HAPPENED<textarea name="description" required minLength={5} placeholder="Describe the problem..." /></label><label>HOW CAN WE REPEAT IT?<textarea name="steps" placeholder="1. Choose Heavy class&#10;2. Hold right-click&#10;3. ..." /></label><button type="submit" className="feedback-send">OPEN EMAIL REPORT</button></form><small>TO: chibachaseygaming@gmail.com</small></section></div>}
    {screen==="playing"&&<><div className="top-score"><div className="team blue">BLUE <b>{hud.blue.toString().padStart(3,"0")}</b></div><div className="mode">CONQUEST <small>FIRST TO 500</small></div><div className="team red"><b>{hud.red.toString().padStart(3,"0")}</b> RED</div></div><div className="objectives">{["A","B","C"].map((x,i)=><span key={x} className={hud.points[i].toLowerCase()}>{x}</span>)}</div>{killNotice&&<div className={`kill-notice ${killNotice.startsWith("HEADSHOT")?"headshot":""}`}>{killNotice}</div>}<div className="crosshair"><i/><i/></div><div className="status-card"><small>{hud.stance}</small><div className="hp-row"><strong>{hud.hp}</strong><span>HP</span></div><div className="hp-track"><i style={{width:`${hud.hp/2}%`}}/></div></div><div className="ammo"><small>{CLASSES[selected].weapon}</small><b>{hud.ammo}</b><span>/ {selected==="HEAVY"?100:selected==="SCOUT"?5:30}</span></div><div className="controls">WASD MOVE Â· SHIFT SPRINT Â· Q AIM Â· CTRL CROUCH Â· Z PRONE Â· SPACE JUMP Â· R RELOAD Â· F11 FULLSCREEN</div></>}
    {(screen==="loadout"||screen==="dead")&&<div className="menu"><header><div className="brand-mark">F</div><div><h1>FRONTLINE</h1><p>INFANTRY COMBAT SYSTEM</p></div><div className="online-dot">â— <span>THEATER ONLINE</span></div></header><section className="brief"><div><span>OPERATION</span><h2>IRON VALLEY</h2><p>CONQUEST // SECURE AND HOLD ALL SECTORS</p></div><div className="ticket"><span>VICTORY CONDITION</span><b>500</b><small>TEAM POINTS</small></div></section><div className="loadout-title"><div><span>SELECT LOADOUT</span><h3>{screen==="dead"?"KILLED IN ACTION â€” REDEPLOY":"CHOOSE YOUR ROLE"}</h3></div><label>AI DIFFICULTY <select value={difficulty} onChange={e=>setDifficulty(e.target.value as keyof typeof DIFFICULTIES)}><option>RECRUIT</option><option>REGULAR</option><option>VETERAN</option></select></label></div><div className="class-grid">{CLASS_KEYS.map((k,i)=>{const c=CLASSES[k];return <button key={k} className={selected===k?"active":""} onClick={()=>setSelected(k)}><span className="class-num">0{i+1}</span><div className="soldier">{["â™Ÿ","â™ž","â™œ","â™›","â™"][i]}</div><h4>{c.label}</h4><p>{c.weapon}</p><dl><div><dt>MOBILITY</dt><dd><i style={{width:`${c.speed*8}%`}}/></dd></div><div><dt>POWER</dt><dd><i style={{width:`${Math.min(100,c.damage*1.5)}%`}}/></dd></div></dl></button>})}</div><div className="deploy-row"><div><span>DEPLOYMENT</span><b>EASTERN BASE</b><small>BLUE CONTROLLED</small></div><button className="deploy" onClick={launch}>{screen==="dead"?"REDEPLOY":"DEPLOY"}<kbd>ENTER</kbd></button></div><footer><span>BUILD 0.1 // INFANTRY PROTOTYPE</span><span>CPU SQUADS ACTIVE</span></footer></div>}
  </main>;
}

