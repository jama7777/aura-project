import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Avatar {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.clock = new THREE.Clock();
        this.isTalking = false;
        this.debugDiv = null;
        this.faceMesh = null;
        this.morphTargetDictionary = {};
        this.currentEmotion = 'neutral';
        this.emotionAnimationQueue = [];
        this.isPlayingEmotionAnimation = false;
        // Eye idle system
        this._eyeIdleRunning = false;
        this._eyeIdleFrame = null;
        this._eyeBlinkTimeout = null;
        this._eyeLookTimeout = null;
        // Emotional recovery
        this._recoveryId = 0;
        this.isInterviewMode = false;

        // ── Multi-avatar catalog ─────────────────────────────────────────────
        // Each entry: { name, url, ext, credit }
        // Users can add more GLB/FBX models to assets/models/ and register here.
        this.AVATAR_CATALOG = [
            { key: 'aura',    name: 'AURA (Default)',   url: '/assets/models/rpm_avatar.glb',    ext: 'glb',  offsetY: -75 },
            { key: 'casual',  name: 'Casual Avatar',    url: '/assets/models/rpm_avatar.glb',    ext: 'glb',  offsetY: -75 },   // placeholder — swap with real model
            { key: 'formal',  name: 'Formal Interviewer', url: '/assets/models/rpm_avatar.glb', ext: 'glb',  offsetY: -75 },   // placeholder
        ];
        this.currentAvatarKey = 'aura';
    }

    log(msg) {
        // Debug only — goes to browser DevTools (F12), never to visible UI
        console.log('[Avatar]', msg);
    }

    init() {
        this.log("Initializing 3D Scene...");

        const container = document.getElementById('canvas-container');

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111111);
        this.scene.fog = new THREE.Fog(0x111111, 200, 1000);

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
        this.camera.position.set(0, 150, 400);

        // Lights
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
        hemiLight.position.set(0, 200, 0);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(0, 200, 100);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        // Ground
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: false }));
        mesh.rotation.x = - Math.PI / 2;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        const grid = new THREE.GridHelper(2000, 20, 0x000000, 0x000000);
        grid.material.opacity = 0.2;
        grid.material.transparent = true;
        this.scene.add(grid);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 100, 0);
        this.controls.update();

        // Create Desk/Table for Interview Mode
        this.createInterviewDesk();

        // Load Model
        this.loadModel();

        // Resize Event
        window.addEventListener('resize', () => this.onWindowResize());

        // Character Upload Input
        const fileInput = document.getElementById('character-upload');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.onFileSelected(e));
        }

        // Animation Loop
        this.animate();
    }

    // ─── Multi-Avatar Switcher ────────────────────────────────────────────────
    /**
     * Load a new avatar by its catalog key.
     * Existing animations are re-attached to the new model's mixer.
     */
    switchAvatar(key) {
        const entry = this.AVATAR_CATALOG.find(a => a.key === key);
        if (!entry) { this.log(`Unknown avatar key: ${key}`); return; }

        this.log(`Switching avatar → ${entry.name}`);
        this.currentAvatarKey = key;

        // Remove old model
        if (this.model) {
            this.scene.remove(this.model);
            if (this.mixer) this.mixer.stopAllAction();
            this.model = null;
            this.mixer = null;
            this.animations = {};
            this.currentAction = null;
            this.faceMesh = null;
            this.jawBone = null;
            this.headBone = null;
            this.morphTargetDictionary = {};
            this.stopIdleEyes();
        }

        if (entry.ext === 'glb') {
            const gltfLoader = new GLTFLoader();
            gltfLoader.load(entry.url, (gltf) => {
                this._setupLoadedModel(gltf.scene, gltf.animations || [], entry.offsetY);
            }, undefined, (err) => this.log('Avatar load error: ' + err));
        } else if (entry.ext === 'fbx') {
            const fbxLoader = new FBXLoader();
            fbxLoader.load(entry.url, (fbx) => {
                this._setupLoadedModel(fbx, fbx.animations || [], entry.offsetY);
            }, undefined, (err) => this.log('Avatar load error: ' + err));
        }
    }

    /** Common post-load setup shared by initial load and switchAvatar */
    _setupLoadedModel(object, animations, offsetY = -75) {
        this.mixer = new THREE.AnimationMixer(object);

        // Auto-scale
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            const targetScale = 150 / maxDim;
            object.scale.set(targetScale, targetScale, targetScale);
        }
        object.position.y = offsetY;

        // Find face mesh + bones
        this.faceMesh = null;
        this.jawBone = null;
        this.headBone = null;
        object.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.morphTargetInfluences && child.morphTargetDictionary) {
                    this.faceMesh = child;
                    this.morphTargetDictionary = child.morphTargetDictionary;
                }
            }
            if (child.isBone) {
                const n = child.name.toLowerCase();
                if (n.includes('jaw')) this.jawBone = child;
                else if (n.includes('head') && !this.headBone) this.headBone = child;
            }
        });

        this.scene.add(object);
        this.model = object;

        // Load animations
        if (animations.length > 0) {
            animations.forEach(clip => {
                this.animations[clip.name] = this.mixer.clipAction(clip);
            });
        }
        this.loadFBXAnimations();

        // If in interview mode, re-apply the sitting camera/desk immediately
        if (this.isInterviewMode) {
            setTimeout(() => {
                if (this.animations['interview_idle']) this.playAnimation('interview_idle');
            }, 500);
        }

        this.log(`✅ Avatar switched to: ${this.currentAvatarKey}`);
        // Fire external callback so UI can update avatar selector
        if (this.onAvatarSwitched) this.onAvatarSwitched(this.currentAvatarKey);
    }

    createInterviewDesk() {
        // ── Realistic interview desk ─────────────────────────────────────────
        // Coordinate reference:
        //   Avatar feet  = y = 0
        //   Avatar is ~160 units tall (head at y ≈ 160)
        //   Real desk height ≈ y = 95  (just below chest when sitting)
        // Strategy: place desk top at y=95, legs hang down to ground.
        // The desk is pushed slightly in front of the avatar (z = -10)
        // so the avatar appears to be seated BEHIND it from the camera.
        const deskGroup = new THREE.Group();

        const DESK_TOP_Y = 0;  // local origin — we'll position the group at y=95

        // ── Table top ────────────────────────────────────────────────────────
        // Wide (160), shallow depth (50), thin (4)
        const topGeo = new THREE.BoxGeometry(160, 4, 50);
        const topMat = new THREE.MeshPhongMaterial({
            color: 0x3b2010,   // dark walnut
            specular: 0x221108,
            shininess: 45
        });
        const topMesh = new THREE.Mesh(topGeo, topMat);
        topMesh.position.y = DESK_TOP_Y;
        topMesh.receiveShadow = true;
        topMesh.castShadow = true;
        deskGroup.add(topMesh);

        // Front edge lip (decorative strip)
        const lipGeo = new THREE.BoxGeometry(160, 2, 1);
        const lipMat = new THREE.MeshPhongMaterial({ color: 0x1a0e06 });
        const lipFront = new THREE.Mesh(lipGeo, lipMat);
        lipFront.position.set(0, DESK_TOP_Y - 2, 25.5);
        deskGroup.add(lipFront);

        // ── Legs: four chunky square legs ────────────────────────────────────
        // Each leg goes from just below the desk top down to y=0 (ground)
        const LEG_HEIGHT = 72;   // matches deskGroup.position.y below
        const legGeo = new THREE.BoxGeometry(5, LEG_HEIGHT, 5);
        const legMat = new THREE.MeshPhongMaterial({
            color: 0x222222,
            specular: 0x555555,
            shininess: 40
        });
        // Offsets from desk centre (half-width=75, half-depth=22)
        const legPositions = [
            [-72, DESK_TOP_Y - 2 - LEG_HEIGHT / 2, -22],
            [ 72, DESK_TOP_Y - 2 - LEG_HEIGHT / 2, -22],
            [-72, DESK_TOP_Y - 2 - LEG_HEIGHT / 2,  22],
            [ 72, DESK_TOP_Y - 2 - LEG_HEIGHT / 2,  22]
        ];
        legPositions.forEach(([x, y, z]) => {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(x, y, z);
            leg.castShadow = true;
            leg.receiveShadow = true;
            deskGroup.add(leg);
        });

        // ── Desk accent panel between front legs ─────────────────────────────
        const panelGeo = new THREE.BoxGeometry(139, 30, 1);
        const panelMat = new THREE.MeshPhongMaterial({ color: 0x2a1808 });
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(0, DESK_TOP_Y - 2 - 15, 22.5);
        deskGroup.add(panel);

        // ── Decorative items on the desk ─────────────────────────────────────

        // Laptop base
        const laptopGeo = new THREE.BoxGeometry(28, 1.5, 20);
        const laptopMat = new THREE.MeshPhongMaterial({ color: 0x2c2c2e, specular: 0x666666, shininess: 70 });
        const laptop = new THREE.Mesh(laptopGeo, laptopMat);
        laptop.position.set(18, DESK_TOP_Y + 2.75, -8);
        deskGroup.add(laptop);

        // Laptop screen (slightly angled back toward avatar)
        const screenGeo = new THREE.BoxGeometry(28, 18, 0.8);
        const screenMat = new THREE.MeshPhongMaterial({ color: 0x101020, emissive: 0x0a0a1a, shininess: 120 });
        const screen = new THREE.Mesh(screenGeo, screenMat);
        screen.position.set(18, DESK_TOP_Y + 12, -17.5);
        screen.rotation.x = THREE.MathUtils.degToRad(20);
        deskGroup.add(screen);

        // Screen glow (blue tint plane facing camera)
        const glowGeo = new THREE.PlaneGeometry(25, 15);
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x1a3a6a, transparent: true, opacity: 0.6 });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.set(18, DESK_TOP_Y + 12, -17.2);
        glow.rotation.x = THREE.MathUtils.degToRad(20);
        deskGroup.add(glow);

        // Notepad
        const padGeo = new THREE.BoxGeometry(16, 0.5, 22);
        const padMat = new THREE.MeshPhongMaterial({ color: 0xfff8e7 });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(-30, DESK_TOP_Y + 2.25, -5);
        deskGroup.add(pad);

        // Pen on notepad
        const penGeo = new THREE.CylinderGeometry(0.5, 0.5, 16);
        const penMat = new THREE.MeshPhongMaterial({ color: 0x1a1a80 });
        const pen = new THREE.Mesh(penGeo, penMat);
        pen.rotation.z = Math.PI / 2;
        pen.position.set(-30, DESK_TOP_Y + 3.5, -12);
        deskGroup.add(pen);

        // Small coffee cup (cylinder)
        const cupGeo = new THREE.CylinderGeometry(3.5, 2.8, 8, 16);
        const cupMat = new THREE.MeshPhongMaterial({ color: 0xf5f5f5 });
        const cup = new THREE.Mesh(cupGeo, cupMat);
        cup.position.set(-55, DESK_TOP_Y + 6, 5);
        deskGroup.add(cup);
        // Coffee (dark liquid top)
        const coffeeGeo = new THREE.CylinderGeometry(3.3, 3.3, 0.5, 16);
        const coffeeMat = new THREE.MeshPhongMaterial({ color: 0x3a1f0d });
        const coffee = new THREE.Mesh(coffeeGeo, coffeeMat);
        coffee.position.set(-55, DESK_TOP_Y + 10, 5);
        deskGroup.add(coffee);

        // ── Position group: desk surface at y=72 (waist level when sitting) ──
        // Avatar feet = y=0, avatar ~150 tall → waist ≈ y=60-75 when seated
        // z = -10 puts desk in FRONT of avatar so she appears behind it
        deskGroup.position.set(0, 72, -10);

        deskGroup.visible = false;
        this.scene.add(deskGroup);
        this.interviewDesk = deskGroup;
    }

    setInterviewMode(active) {
        this.log(`Setting Interview Mode: ${active}`);
        this.isInterviewMode = active;

        if (active) {
            // ── Show the desk ──────────────────────────────────────────────
            if (this.interviewDesk) this.interviewDesk.visible = true;

            // ── Scene: remove grid / darken background for professional look ─
            this.scene.background = new THREE.Color(0x0d0d14);  // dark office blue
            this.scene.fog = new THREE.Fog(0x0d0d14, 300, 900);

            // ── Camera: looking at AURA's face from across the desk ─────────
            // Desk top now at y=72 (waist). Avatar head is around y=120-130.
            // Camera at y=120, z=240 gives a natural over-the-desk eye-level view.
            this.camera.position.set(0, 120, 240);
            if (this.controls) {
                this.controls.target.set(0, 110, 0);   // aim at AURA's face
                this.controls.minDistance = 80;
                this.controls.maxDistance = 350;
                this.controls.update();
            }

            // ── Animation: sitting pose ────────────────────────────────────
            if (this.animations['interview_idle']) {
                this.playAnimation('interview_idle');
            }

            // ── Add a warm desk lamp light ─────────────────────────────────
            if (!this._deskLamp) {
                const deskLight = new THREE.PointLight(0xfff5e0, 2.0, 250);
                deskLight.position.set(-40, 150, 30);
                this.scene.add(deskLight);
                this._deskLamp = deskLight;
            }

        } else {
            // ── Hide desk ──────────────────────────────────────────────────
            if (this.interviewDesk) this.interviewDesk.visible = false;

            // ── Restore scene ──────────────────────────────────────────────
            this.scene.background = new THREE.Color(0x111111);
            this.scene.fog = new THREE.Fog(0x111111, 200, 1000);

            if (this._deskLamp) {
                this.scene.remove(this._deskLamp);
                this._deskLamp = null;
            }

            // ── Restore default camera ─────────────────────────────────────
            this.camera.position.set(0, 150, 400);
            if (this.controls) {
                this.controls.target.set(0, 100, 0);
                this.controls.minDistance = 0;
                this.controls.maxDistance = Infinity;
                this.controls.update();
            }

            // ── Switch back to standing idle ───────────────────────────────
            this.playAnimation('idle');
        }
    }

    onFileSelected(event) {
        const file = event.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const filename = file.name.toLowerCase();
        let extension = 'obj';
        if (filename.endsWith('.fbx')) extension = 'fbx';
        else if (filename.endsWith('.glb') || filename.endsWith('.gltf')) extension = 'glb';

        this.log(`Selected file: ${filename}`);
        this.loadCharacterFromUrl(url, extension);
    }

    loadCharacterFromUrl(url, extension) {
        this.log(`Loading character from URL (${extension})...`);

        if (this.model) {
            this.scene.remove(this.model);
            // Dispose geometry/material if possible to free memory
            this.model = null;
        }

        const manager = new THREE.LoadingManager();
        manager.onLoad = () => {
            this.log('Character loaded successfully.');
        };

        const onLoaded = (loadedData) => {
            let modelObject = loadedData;
            let animations = [];

            if (extension === 'glb') {
                modelObject = loadedData.scene;
                animations = loadedData.animations || [];
            } else {
                modelObject = loadedData;
                animations = modelObject.animations || [];
            }

            this.model = modelObject;
            this.scene.add(modelObject);

            // Scale and Position
            const box = new THREE.Box3().setFromObject(modelObject);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            if (maxDim > 0) {
                const targetScale = 150 / maxDim; // Normalize to ~150 units tall/wide
                modelObject.scale.set(targetScale, targetScale, targetScale);
            }
            modelObject.position.y = -75; // Center vertically roughly

            // Setup Components
            this.mixer = new THREE.AnimationMixer(modelObject);

            // Find Face Mesh for Morph Targets
            modelObject.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.morphTargetInfluences && child.morphTargetDictionary) {
                        this.log(`Found Face Mesh: ${child.name}`);
                        this.faceMesh = child;
                        this.morphTargetDictionary = child.morphTargetDictionary;
                    }
                }
            });

            // Extract Animations if present
            if (animations && animations.length > 0) {
                animations.forEach(clip => {
                    this.cleanAnimationClips(clip);
                    this.animations[clip.name] = this.mixer.clipAction(clip);
                });
                this.playAnimation('idle') || (animations[0] && this.playAnimation(animations[0].name));
            }
        };

        if (extension === 'fbx') {
            const loader = new FBXLoader(manager);
            loader.load(url, onLoaded, undefined, (err) => this.log("Error loading FBX: " + err));
        } else if (extension === 'glb') {
            const loader = new GLTFLoader(manager);
            loader.load(url, onLoaded, undefined, (err) => this.log("Error loading GLB: " + err));
        } else {
            // OBJ
            const loader = new OBJLoader(manager);
            loader.load(url, onLoaded, undefined, (err) => this.log("Error loading OBJ: " + err));
        }
    }

    loadModel() {
        const loadingManager = new THREE.LoadingManager();

        loadingManager.onLoad = () => {
            console.log('Loading complete!');
            this.log('Loading complete!');
        };

        // Fallback: If model doesn't load in 60 seconds, show a cube
        setTimeout(() => {
            if (!this.model) {
                this.log("TIMEOUT: Model failed to load (60s). Showing fallback cube.");
                const geometry = new THREE.BoxGeometry(50, 50, 50);
                const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                const cube = new THREE.Mesh(geometry, material);
                cube.position.y = 50;
                this.scene.add(cube);
            }
        }, 60000);

        // Load Ready Player Me Avatar (GLB with ARKit blendshapes for lip sync)
        const gltfLoader = new GLTFLoader(loadingManager);
        const modelUrl = `/assets/models/rpm_avatar.glb`;

        this.log(`Loading GLB Model: ${modelUrl}`);

        gltfLoader.load(modelUrl, (gltf) => {
            const object = gltf.scene;
            const animations = gltf.animations || [];

            this.log("GLB Model loaded successfully!");
            this.mixer = new THREE.AnimationMixer(object);

            // Auto-scale
            const box = new THREE.Box3().setFromObject(object);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            if (maxDim > 0) {
                const targetScale = 150 / maxDim;
                object.scale.set(targetScale, targetScale, targetScale);
            }
            object.position.y = -75;

            // Find Face Mesh with morph targets and bones
            object.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    // Check for Morph Targets (ARKit blendshapes)
                    if (child.morphTargetInfluences && child.morphTargetDictionary) {
                        this.log(`Found Face Mesh: ${child.name}`);
                        this.log(`  Morph targets count: ${Object.keys(child.morphTargetDictionary).length}`);
                        this.faceMesh = child;
                        this.morphTargetDictionary = child.morphTargetDictionary;
                    }
                }
                // Check for Bones (jaw, head for fallback)
                if (child.isBone) {
                    const nameLower = child.name.toLowerCase();
                    if (nameLower.includes('jaw')) {
                        this.log(`Found Jaw Bone: ${child.name}`);
                        this.jawBone = child;
                    } else if (nameLower.includes('head') && !this.headBone) {
                        this.log(`Found Head Bone: ${child.name}`);
                        this.headBone = child;
                    }
                }
            });

            // Log detection summary
            if (this.faceMesh) {
                this.log("✓ Morph targets ready for lip sync!");
            } else {
                this.log("WARNING: No morph targets found.");
            }

            this.scene.add(object);
            this.model = object;

            // Load animations if present in GLB
            if (animations.length > 0) {
                animations.forEach(clip => {
                    this.animations[clip.name] = this.mixer.clipAction(clip);
                });
            }

            // Load FBX animations from assets/animations folder
            this.loadFBXAnimations();
        },
            (progress) => {
                // Progress callback
                if (progress.total > 0) {
                    const pct = Math.round((progress.loaded / progress.total) * 100);
                    this.log(`Loading: ${pct}%`);
                }
            },
            (error) => {
                this.log(`Error loading GLB: ${error}`);
                this.log("Falling back to OBJ model...");
                this.loadOBJFallback(loadingManager);
            });
    }

    loadOBJFallback(loadingManager) {
        const objLoader = new OBJLoader(loadingManager);
        const mtlLoader = new MTLLoader(loadingManager);
        const modelUrl = `/assets/models/character.obj`;
        const mtlUrl = `/assets/models/character.mtl`;

        this.log(`Loading OBJ Model: ${modelUrl}`);

        mtlLoader.load(mtlUrl, (materials) => {
            materials.preload();
            objLoader.setMaterials(materials);
            objLoader.load(modelUrl, (object) => {
                this.log("OBJ Model loaded (no morph targets).");
                this.mixer = new THREE.AnimationMixer(object);

                const box = new THREE.Box3().setFromObject(object);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                if (maxDim > 0) {
                    const targetScale = 150 / maxDim;
                    object.scale.set(targetScale, targetScale, targetScale);
                }
                object.position.y = -75;

                object.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                this.scene.add(object);
                this.model = object;
            });
        });
    }

    loadFBXAnimations() {
        // Map the user's downloaded Mixamo animations to our emotion system names
        const animationMap = {
            'idle': 'Catwalk Idle To Twist R.fbx',  // Cat walk idle
            'interview_idle': 'Sitting_interview_position@1.fbx', // Interview sitting
            'happy': 'Sitting Laughing.fbx',
            'dance': 'Hip Hop Dancing.fbx',
            'clap': 'Clapping.fbx',
            'jump': 'Jumping Down.fbx',
            'sad': 'Defeated.fbx',
            'pray': 'Praying.fbx',
            'crouch': 'Crouch To Stand.fbx',
            'hug': 'Sitting Laughing.fbx',  // Reuse happy for hug
            'angry': 'Defeated.fbx'  // Reuse defeated for angry (tense posture)
        };

        const fbxLoader = new FBXLoader();
        let loadedCount = 0;
        const totalAnimations = Object.keys(animationMap).length;

        this.log(`Loading ${totalAnimations} FBX animations...`);

        Object.entries(animationMap).forEach(([animName, fileName]) => {
            const filePath = `/assets/animations/${fileName}`;

            fbxLoader.load(
                filePath,
                (fbx) => {
                    // FBX files contain animations
                    if (fbx.animations && fbx.animations.length > 0) {
                        const clip = fbx.animations[0];

                        // Clean the animation clip (rename bones to match our skeleton)
                        this.cleanAnimationClips(clip);

                        // Create animation action
                        this.animations[animName] = this.mixer.clipAction(clip);
                        loadedCount++;
                        this.log(`✓ Loaded: ${animName} (from ${fileName})`);
                    } else {
                        this.log(`⚠️ No animation data in: ${fileName}`);
                    }

                    // Check if all animations loaded
                    if (loadedCount === totalAnimations) {
                        this.log(`🎉 All ${loadedCount} animations loaded and ready!`);
                        this.log(`Available: ${Object.keys(this.animations).join(', ')}`);

                        // Start with idle animation
                        if (this.animations['idle']) {
                            this.playAnimation('idle');
                        }
                    }
                },
                (progress) => {
                    // Progress callback
                },
                (error) => {
                    console.error(`Error loading ${fileName}:`, error);
                    this.log(`❌ Error: ${animName} - ${error.message}`);
                }
            );
        });
    }

    playAnimation(name, loopOnce = false) {
        if (!this.mixer) return;

        if (!this.animations[name]) {
            console.warn(`Animation ${name} not found.`);
            return;
        }

        const action = this.animations[name];
        const isIdle = (name === 'idle');
        const shouldSwitch = isIdle || (this.currentAction !== action);

        if (shouldSwitch) {
            if (this.currentAction && this.currentAction !== action) {
                this.currentAction.fadeOut(0.5);
            }

            action.reset().fadeIn(0.3);
            action.clampWhenFinished = loopOnce;

            if (loopOnce) {
                // Play once, then auto-return to idle
                action.setLoop(THREE.LoopOnce);
                if (this._finishedListener) {
                    this.mixer.removeEventListener('finished', this._finishedListener);
                }
                this._finishedListener = (e) => {
                    if (e.action === action) {
                        this.mixer.removeEventListener('finished', this._finishedListener);
                        this._finishedListener = null;
                        this.playAnimation('idle');
                    }
                };
                this.mixer.addEventListener('finished', this._finishedListener);
                // Stop eye idle while emotion animation plays
                this.stopIdleEyes();
            } else if (isIdle) {
                // Idle ping-pongs: front → twist → front → ...
                action.setLoop(THREE.LoopPingPong);
                action.clampWhenFinished = false;
                // Start eye idle system as soon as idle kicks in
                setTimeout(() => this.startIdleEyes(), 300);
            } else if (name === 'interview_idle') {
                action.setLoop(THREE.LoopRepeat);
                action.clampWhenFinished = false;
                setTimeout(() => this.startIdleEyes(), 300);
            } else {
                action.setLoop(THREE.LoopRepeat);
                this.stopIdleEyes();
            }

            action.play();
            this.currentAction = action;
        }
    }


    playIntroSequence() {
        this.log("Playing Intro Sequence...");
        const sequence = ['dance', 'happy', 'sad', 'jump', 'pray', 'clap'];
        this.playSequence(sequence, () => {
            this.log("Intro complete. Switching to Idle.");
            this.playAnimation('idle');
        });
    }

    playSequence(sequence, onComplete) {
        let index = 0;

        const playNext = () => {
            if (index >= sequence.length) {
                if (onComplete) onComplete();
                return;
            }

            const animName = sequence[index];
            // this.log(`Sequence: ${animName}`);

            if (!this.animations[animName]) {
                index++;
                playNext();
                return;
            }

            const action = this.animations[animName];

            if (this.currentAction) this.currentAction.fadeOut(0.5);

            action.reset().fadeIn(0.5);
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
            action.play();
            this.currentAction = action;

            const onFinished = (e) => {
                if (e.action === action) {
                    this.mixer.removeEventListener('finished', onFinished);
                    index++;
                    playNext();
                }
            };
            this.mixer.addEventListener('finished', onFinished);
        };

        playNext();
    }

    setTalking(talking) {
        this.isTalking = talking;
        if (talking) {
            // Eyes keep blinking/looking while AURA speaks — do NOT stop them
            // (lip sync uses mouth/jaw shapes, eyes are independent)
        } else {
            // Talking finished — gradually recover face to neutral instead of instant snap
            this.gradualEmotionalRecovery();
        }
    }

    /**
     * Slowly fade the current emotional face expression back to neutral.
     * Uses ease-in curve: face holds emotion at first, then softly dissolves.
     * Like watching a real person's expression gradually relax.
     * @param {number} duration — ms for the full recovery (default 4000ms)
     */
    gradualEmotionalRecovery(duration = 4000) {
        if (!this.faceMesh) return;

        // Emotion-specific recovery speeds:
        // Sad lingers longest, happy fades quicker, neutral is instant
        const emotionDurations = {
            'sad': 5000, 'sadness': 5000, 'depressed': 5500,
            'angry': 3500, 'frustrated': 3000,
            'happy': 2500, 'joy': 2000, 'excited': 2000,
            'surprised': 1500, 'shocked': 1500,
            'fear': 3000, 'scared': 3000,
            'love': 3000, 'neutral': 0
        };
        const actualDuration = emotionDurations[this.currentEmotion] ?? duration;
        if (actualDuration === 0) return; // Already neutral, nothing to do

        const startInfluences = [...this.faceMesh.morphTargetInfluences];
        // Check if there's anything to fade at all (skip if all zeroes)
        const hasExpression = startInfluences.some(v => v > 0.01);
        if (!hasExpression) return;

        const startTime = performance.now();
        // Tag this recovery so a new one can cancel the old one
        const recoveryId = ++this._recoveryId;

        this.log(`Emotional recovery: ${this.currentEmotion} → neutral over ${actualDuration}ms`);

        const recover = () => {
            // If a newer recovery started, stop this one
            if (this._recoveryId !== recoveryId) return;

            const elapsed = performance.now() - startTime;
            const t = Math.min(1, elapsed / actualDuration);

            // ease-in (quadratic): slow start = holds emotion, fast end = quick dissolve
            // feels like real emotional fade: "still sad... still sad... ok better now"
            const eased = t * t;

            for (let i = 0; i < startInfluences.length; i++) {
                if (startInfluences[i] > 0) {
                    this.faceMesh.morphTargetInfluences[i] = startInfluences[i] * (1 - eased);
                }
            }

            if (t < 1) {
                requestAnimationFrame(recover);
            } else {
                this.currentEmotion = 'neutral';
                this.log('Emotional recovery complete → neutral');
            }
        };

        requestAnimationFrame(recover);
    }

    updateFace(blendshapes, emotion = "neutral") {
        // Apply Emotion Modifiers (Layering)
        this.applyEmotionModifiers(emotion, blendshapes);

        // blendshapes is a dict: { "jawOpen": 0.5, ... }
        let hasMorphs = false;
        if (this.faceMesh && this.morphTargetDictionary) {
            hasMorphs = true;
            for (const [name, value] of Object.entries(blendshapes)) {
                // Try to find a matching key in the dictionary
                let match = this.findMorphTarget(name);

                if (match !== null) {
                    const index = this.morphTargetDictionary[match];
                    this.faceMesh.morphTargetInfluences[index] = value;
                }
            }
        }

        // Fallback: Bone Rotation if no morphs found (or even if found, for extra effect)
        // If we have a jaw bone, rotate it based on 'jawOpen'
        const jawValue = blendshapes["jawOpen"] || 0;

        if (this.jawBone) {
            // Typically jaw rotates around X axis. Value 0..1
            // 0.8 rad is more visible (~45 degrees)
            this.jawBone.rotation.x = jawValue * 0.8;
        } else if (this.headBone) {
            // If no jaw bone, subtly bob the head to simulate speech
            this.headBone.rotation.x = jawValue * 0.15;
        } else if (!hasMorphs && this.model) {
            // Ultimate fallback: if no morph targets, no jaw bone, no head bone
            // Apply a subtle vertical scale pulse to simulate talking
            // This is a hacky but visible way to show lip sync is working
            const baseScale = this.model.userData.baseScale || 1;
            if (!this.model.userData.baseScale) {
                this.model.userData.baseScale = this.model.scale.y;
            }
            // Subtle scale change (1-3% based on jawOpen)
            this.model.scale.y = this.model.userData.baseScale * (1 + jawValue * 0.03);

            // Also log that we're in fallback mode (once)
            if (!this.warnedNoMorphs) {
                this.log("Using model scale fallback for lip sync (no morph targets or bones found)");
                this.warnedNoMorphs = true;
            }
        }
    }

    findMorphTarget(aceName) {
        // Direct match first
        if (aceName in this.morphTargetDictionary) return aceName;

        // NVIDIA ACE uses ARKit standard naming
        // Ready Player Me uses similar but sometimes different naming
        // This mapping ensures maximum compatibility

        const aceToRpmMap = {
            // Jaw
            'jawOpen': 'jawOpen',
            'jawForward': 'jawForward',
            'jawLeft': 'jawLeft',
            'jawRight': 'jawRight',

            // Mouth - Primary lip sync shapes
            'mouthClose': 'mouthClose',
            'mouthFunnel': 'mouthFunnel',
            'mouthPucker': 'mouthPucker',
            'mouthLeft': 'mouthLeft',
            'mouthRight': 'mouthRight',
            'mouthSmileLeft': 'mouthSmileLeft',
            'mouthSmileRight': 'mouthSmileRight',
            'mouthSmile_L': 'mouthSmileLeft',
            'mouthSmile_R': 'mouthSmileRight',
            'mouthFrownLeft': 'mouthFrownLeft',
            'mouthFrownRight': 'mouthFrownRight',
            'mouthFrown_L': 'mouthFrownLeft',
            'mouthFrown_R': 'mouthFrownRight',
            'mouthDimpleLeft': 'mouthDimpleLeft',
            'mouthDimpleRight': 'mouthDimpleRight',
            'mouthStretchLeft': 'mouthStretchLeft',
            'mouthStretchRight': 'mouthStretchRight',
            'mouthRollLower': 'mouthRollLower',
            'mouthRollUpper': 'mouthRollUpper',
            'mouthShrugLower': 'mouthShrugLower',
            'mouthShrugUpper': 'mouthShrugUpper',
            'mouthPressLeft': 'mouthPressLeft',
            'mouthPressRight': 'mouthPressRight',
            'mouthPress_L': 'mouthPressLeft',
            'mouthPress_R': 'mouthPressRight',
            'mouthLowerDownLeft': 'mouthLowerDownLeft',
            'mouthLowerDownRight': 'mouthLowerDownRight',
            'mouthUpperUpLeft': 'mouthUpperUpLeft',
            'mouthUpperUpRight': 'mouthUpperUpRight',

            // Cheeks
            'cheekPuff': 'cheekPuff',
            'cheekSquintLeft': 'cheekSquintLeft',
            'cheekSquintRight': 'cheekSquintRight',
            'cheekSquint_L': 'cheekSquintLeft',
            'cheekSquint_R': 'cheekSquintRight',

            // Nose
            'noseSneerLeft': 'noseSneerLeft',
            'noseSneerRight': 'noseSneerRight',
            'noseSneer_L': 'noseSneerLeft',
            'noseSneer_R': 'noseSneerRight',

            // Tongue
            'tongueOut': 'tongueOut',

            // Eyes (for emotion blending)
            'eyeBlinkLeft': 'eyeBlinkLeft',
            'eyeBlinkRight': 'eyeBlinkRight',
            'eyeBlink_L': 'eyeBlinkLeft',
            'eyeBlink_R': 'eyeBlinkRight',
            'eyeWideLeft': 'eyeWideLeft',
            'eyeWideRight': 'eyeWideRight',
            'eyeWide_L': 'eyeWideLeft',
            'eyeWide_R': 'eyeWideRight',
            'eyeSquintLeft': 'eyeSquintLeft',
            'eyeSquintRight': 'eyeSquintRight',
            'eyeSquint_L': 'eyeSquintLeft',
            'eyeSquint_R': 'eyeSquintRight',

            // Brows (for expression)
            'browDownLeft': 'browDownLeft',
            'browDownRight': 'browDownRight',
            'browDown_L': 'browDownLeft',
            'browDown_R': 'browDownRight',
            'browInnerUp': 'browInnerUp',
            'browOuterUpLeft': 'browOuterUpLeft',
            'browOuterUpRight': 'browOuterUpRight',
            'browOuterUp_L': 'browOuterUpLeft',
            'browOuterUp_R': 'browOuterUpRight'
        };

        // Check mapped name
        if (aceToRpmMap[aceName] && aceToRpmMap[aceName] in this.morphTargetDictionary) {
            return aceToRpmMap[aceName];
        }

        // Case-insensitive match
        const lowerName = aceName.toLowerCase();
        for (const key in this.morphTargetDictionary) {
            if (key.toLowerCase() === lowerName) return key;
        }

        // Try _L/_R to Left/Right conversion
        let mapped = aceName.replace("_L", "Left").replace("_R", "Right");
        if (mapped in this.morphTargetDictionary) return mapped;

        // Try casing on mapped
        for (const key in this.morphTargetDictionary) {
            if (key.toLowerCase() === mapped.toLowerCase()) return key;
        }

        return null; // No match found
    }

    applyEmotionModifiers(emotion, blendshapes) {
        // Strong boost factors for visible emotion expressions
        const STRONG = 0.7;
        const MEDIUM = 0.5;
        const LIGHT = 0.3;

        // Emotion expressions - these are added ON TOP of lip sync
        switch (emotion.toLowerCase()) {
            case "happy":
            case "joy":
            case "excited":
                // Big smile, squinted happy eyes, raised cheeks
                blendshapes["mouthSmileLeft"] = (blendshapes["mouthSmileLeft"] || 0) + STRONG;
                blendshapes["mouthSmileRight"] = (blendshapes["mouthSmileRight"] || 0) + STRONG;
                blendshapes["mouthSmile_L"] = (blendshapes["mouthSmile_L"] || 0) + STRONG;
                blendshapes["mouthSmile_R"] = (blendshapes["mouthSmile_R"] || 0) + STRONG;
                blendshapes["eyeSquintLeft"] = (blendshapes["eyeSquintLeft"] || 0) + MEDIUM;
                blendshapes["eyeSquintRight"] = (blendshapes["eyeSquintRight"] || 0) + MEDIUM;
                blendshapes["cheekSquintLeft"] = (blendshapes["cheekSquintLeft"] || 0) + LIGHT;
                blendshapes["cheekSquintRight"] = (blendshapes["cheekSquintRight"] || 0) + LIGHT;
                blendshapes["browInnerUp"] = (blendshapes["browInnerUp"] || 0) + LIGHT;
                break;

            case "angry":
            case "anger":
            case "frustrated":
                // Furrowed brows, tight lips, intense eyes
                blendshapes["browDownLeft"] = (blendshapes["browDownLeft"] || 0) + STRONG;
                blendshapes["browDownRight"] = (blendshapes["browDownRight"] || 0) + STRONG;
                blendshapes["eyeSquintLeft"] = (blendshapes["eyeSquintLeft"] || 0) + MEDIUM;
                blendshapes["eyeSquintRight"] = (blendshapes["eyeSquintRight"] || 0) + MEDIUM;
                blendshapes["mouthPressLeft"] = (blendshapes["mouthPressLeft"] || 0) + MEDIUM;
                blendshapes["mouthPressRight"] = (blendshapes["mouthPressRight"] || 0) + MEDIUM;
                blendshapes["noseSneerLeft"] = (blendshapes["noseSneerLeft"] || 0) + LIGHT;
                blendshapes["noseSneerRight"] = (blendshapes["noseSneerRight"] || 0) + LIGHT;
                blendshapes["jawForward"] = (blendshapes["jawForward"] || 0) + LIGHT;
                break;

            case "sad":
            case "sadness":
            case "depressed":
            case "upset":
                // Droopy eyes, frown, inner brows up
                blendshapes["browInnerUp"] = (blendshapes["browInnerUp"] || 0) + STRONG;
                blendshapes["mouthFrownLeft"] = (blendshapes["mouthFrownLeft"] || 0) + MEDIUM;
                blendshapes["mouthFrownRight"] = (blendshapes["mouthFrownRight"] || 0) + MEDIUM;
                blendshapes["eyeBlinkLeft"] = (blendshapes["eyeBlinkLeft"] || 0) + LIGHT;
                blendshapes["eyeBlinkRight"] = (blendshapes["eyeBlinkRight"] || 0) + LIGHT;
                blendshapes["mouthPucker"] = (blendshapes["mouthPucker"] || 0) + LIGHT;
                // Reduce other expressions for subdued look
                for (const key in blendshapes) {
                    if (!key.includes("brow") && !key.includes("Frown") && !key.includes("Blink")) {
                        blendshapes[key] *= 0.7;
                    }
                }
                break;

            case "surprised":
            case "surprise":
            case "shocked":
            case "amazed":
                // Wide eyes, raised brows, open mouth
                blendshapes["eyeWideLeft"] = (blendshapes["eyeWideLeft"] || 0) + STRONG;
                blendshapes["eyeWideRight"] = (blendshapes["eyeWideRight"] || 0) + STRONG;
                blendshapes["browInnerUp"] = (blendshapes["browInnerUp"] || 0) + STRONG;
                blendshapes["browOuterUpLeft"] = (blendshapes["browOuterUpLeft"] || 0) + STRONG;
                blendshapes["browOuterUpRight"] = (blendshapes["browOuterUpRight"] || 0) + STRONG;
                blendshapes["jawOpen"] = (blendshapes["jawOpen"] || 0) + MEDIUM;
                blendshapes["mouthFunnel"] = (blendshapes["mouthFunnel"] || 0) + LIGHT;
                break;

            case "fear":
            case "scared":
            case "afraid":
            case "worried":
                // Wide eyes, raised inner brows, tense mouth
                blendshapes["eyeWideLeft"] = (blendshapes["eyeWideLeft"] || 0) + STRONG;
                blendshapes["eyeWideRight"] = (blendshapes["eyeWideRight"] || 0) + STRONG;
                blendshapes["browInnerUp"] = (blendshapes["browInnerUp"] || 0) + STRONG;
                blendshapes["mouthStretchLeft"] = (blendshapes["mouthStretchLeft"] || 0) + MEDIUM;
                blendshapes["mouthStretchRight"] = (blendshapes["mouthStretchRight"] || 0) + MEDIUM;
                blendshapes["jawOpen"] = (blendshapes["jawOpen"] || 0) + LIGHT;
                break;

            case "disgust":
            case "disgusted":
                // Wrinkled nose, raised upper lip
                blendshapes["noseSneerLeft"] = (blendshapes["noseSneerLeft"] || 0) + STRONG;
                blendshapes["noseSneerRight"] = (blendshapes["noseSneerRight"] || 0) + STRONG;
                blendshapes["mouthUpperUpLeft"] = (blendshapes["mouthUpperUpLeft"] || 0) + MEDIUM;
                blendshapes["mouthUpperUpRight"] = (blendshapes["mouthUpperUpRight"] || 0) + MEDIUM;
                blendshapes["browDownLeft"] = (blendshapes["browDownLeft"] || 0) + LIGHT;
                blendshapes["browDownRight"] = (blendshapes["browDownRight"] || 0) + LIGHT;
                break;

            case "love":
            case "loving":
            case "affectionate":
                // Soft smile, slightly closed eyes
                blendshapes["mouthSmileLeft"] = (blendshapes["mouthSmileLeft"] || 0) + MEDIUM;
                blendshapes["mouthSmileRight"] = (blendshapes["mouthSmileRight"] || 0) + MEDIUM;
                blendshapes["eyeBlinkLeft"] = (blendshapes["eyeBlinkLeft"] || 0) + LIGHT;
                blendshapes["eyeBlinkRight"] = (blendshapes["eyeBlinkRight"] || 0) + LIGHT;
                blendshapes["cheekSquintLeft"] = (blendshapes["cheekSquintLeft"] || 0) + LIGHT;
                blendshapes["cheekSquintRight"] = (blendshapes["cheekSquintRight"] || 0) + LIGHT;
                break;

            case "confused":
            case "puzzled":
                // Asymmetric brows, slight frown
                blendshapes["browOuterUpLeft"] = (blendshapes["browOuterUpLeft"] || 0) + MEDIUM;
                blendshapes["browDownRight"] = (blendshapes["browDownRight"] || 0) + LIGHT;
                blendshapes["mouthLeft"] = (blendshapes["mouthLeft"] || 0) + LIGHT;
                blendshapes["eyeSquintRight"] = (blendshapes["eyeSquintRight"] || 0) + LIGHT;
                break;

            case "thinking":
            case "thoughtful":
                // Slight squint, mouth shifted
                blendshapes["eyeSquintLeft"] = (blendshapes["eyeSquintLeft"] || 0) + LIGHT;
                blendshapes["eyeSquintRight"] = (blendshapes["eyeSquintRight"] || 0) + LIGHT;
                blendshapes["browInnerUp"] = (blendshapes["browInnerUp"] || 0) + LIGHT;
                blendshapes["mouthPucker"] = (blendshapes["mouthPucker"] || 0) + LIGHT;
                blendshapes["mouthRight"] = (blendshapes["mouthRight"] || 0) + LIGHT;
                break;

            case "neutral":
            default:
                // No additional modifiers for neutral
                break;
        }

        // Clamp all values to 0-1
        for (const key in blendshapes) {
            blendshapes[key] = Math.max(0, Math.min(1, blendshapes[key]));
        }
    }

    // Show emotion on face WITHOUT lip sync (for idle emotional state)
    showEmotion(emotion, intensity = 1.0, triggerAnimation = true) {
        if (!this.faceMesh || !this.morphTargetDictionary) return;

        const blendshapes = {};
        this.applyEmotionModifiers(emotion, blendshapes);

        // Apply with intensity scaling
        for (const [name, value] of Object.entries(blendshapes)) {
            const match = this.findMorphTarget(name);
            if (match !== null) {
                const index = this.morphTargetDictionary[match];
                this.faceMesh.morphTargetInfluences[index] = value * intensity;
            }
        }

        this.currentEmotion = emotion;
        this.log(`Showing emotion: ${emotion} (intensity: ${intensity})`);

        // Trigger corresponding body animation if enabled
        if (triggerAnimation) {
            this.playEmotionAnimation(emotion, intensity);
        }
    }

    // Animate transition between emotions
    transitionToEmotion(targetEmotion, duration = 500, triggerAnimation = true) {
        if (!this.faceMesh) return;

        const startInfluences = [...this.faceMesh.morphTargetInfluences];
        const targetBlendshapes = {};
        this.applyEmotionModifiers(targetEmotion, targetBlendshapes);

        // Build target influences array
        const targetInfluences = new Array(startInfluences.length).fill(0);
        for (const [name, value] of Object.entries(targetBlendshapes)) {
            const match = this.findMorphTarget(name);
            if (match !== null) {
                const index = this.morphTargetDictionary[match];
                targetInfluences[index] = value;
            }
        }

        const startTime = performance.now();

        const animate = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(1, elapsed / duration);
            // Smooth easing
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            for (let i = 0; i < startInfluences.length; i++) {
                this.faceMesh.morphTargetInfluences[i] =
                    startInfluences[i] + (targetInfluences[i] - startInfluences[i]) * eased;
            }

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                this.currentEmotion = targetEmotion;
                if (triggerAnimation) {
                    if (targetEmotion === 'neutral') {
                        // Neutral → always return to looping idle (unfreeze any stuck state)
                        if (!this.isPlayingEmotionAnimation) {
                            this.playAnimation('idle');
                        }
                    } else {
                        // Non-neutral → trigger matching body animation
                        this.playEmotionAnimation(targetEmotion, 1.0);
                    }
                }
            }
        };

        requestAnimationFrame(animate);
    }

    resetFace() {
        if (!this.faceMesh) return;
        // Fast snap to neutral (used only in edge cases — normal flow uses gradualEmotionalRecovery)
        this.transitionToEmotion("neutral", 300, false);
    }

    /**
     * Map emotions to appropriate body animations
     * Creates a rich, varied response by selecting animations that match the emotion
     */
    getAnimationForEmotion(emotion, intensity = 1.0) {
        // Emotion to animation mapping
        // Returns array of possible animations, will pick based on intensity
        const emotionAnimationMap = {
            'happy': {
                high: ['dance', 'jump', 'clap'],      // Intense happiness
                medium: ['happy', 'clap'],             // Moderate happiness
                low: ['happy']                          // Subtle happiness
            },
            'joy': {
                high: ['dance', 'jump', 'clap'],
                medium: ['happy', 'clap'],
                low: ['happy']
            },
            'excited': {
                high: ['jump', 'dance', 'clap'],
                medium: ['jump', 'happy'],
                low: ['happy']
            },
            'sad': {
                high: ['sad'],                          // Deep sadness (slow, head down)
                medium: ['sad'],
                low: ['sad']
            },
            'depressed': {
                high: ['sad'],
                medium: ['sad'],
                low: ['sad']
            },
            'upset': {
                high: ['sad'],
                medium: ['sad'],
                low: ['sad']
            },
            'angry': {
                high: ['angry', 'hug'],                // Very angry (tense posture)
                medium: ['angry'],
                low: ['angry']
            },
            'frustrated': {
                high: ['angry'],
                medium: ['angry'],
                low: ['angry']
            },
            'surprised': {
                high: ['jump'],                        // Big surprise - jump
                medium: ['happy'],                     // Moderate surprise - gesture
                low: ['happy']
            },
            'shocked': {
                high: ['jump'],
                medium: ['happy'],
                low: ['happy']
            },
            'amazed': {
                high: ['jump', 'clap'],
                medium: ['clap'],
                low: ['happy']
            },
            'fear': {
                high: ['sad'],                         // Cowering/defensive
                medium: ['sad'],
                low: ['sad']
            },
            'scared': {
                high: ['sad'],
                medium: ['sad'],
                low: ['sad']
            },
            'worried': {
                high: ['sad'],
                medium: ['sad'],
                low: ['sad']
            },
            'fearful': {
                high: ['sad', 'crouch'],
                medium: ['sad'],
                low: ['sad']
            },
            'disgusted': {
                high: ['sad'],
                medium: ['sad'],
                low: ['sad']
            },
            'love': {
                high: ['hug', 'happy'],                // Warm, open gestures
                medium: ['hug'],
                low: ['happy']
            },
            'grateful': {
                high: ['pray', 'hug'],                 // Thankful gestures
                medium: ['pray'],
                low: ['happy']
            },
            'confused': {
                high: ['idle'],                        // Confused - minimal animation
                medium: ['idle'],
                low: ['idle']
            },
            'thinking': {
                high: ['idle'],                        // Thoughtful - subtle
                medium: ['idle'],
                low: ['idle']
            },
            'neutral': {
                high: ['idle'],
                medium: ['idle'],
                low: ['idle']
            }
        };

        // Determine intensity level
        let level = 'low';
        if (intensity >= 0.7) {
            level = 'high';
        } else if (intensity >= 0.4) {
            level = 'medium';
        }

        // Get animations for this emotion
        const emotionData = emotionAnimationMap[emotion.toLowerCase()];
        if (!emotionData) {
            this.log(`No animation mapping for emotion: ${emotion}, using neutral`);
            return 'idle';
        }

        const animationOptions = emotionData[level] || emotionData.medium || emotionData.low;

        // Pick a random animation from the options
        const selectedAnimation = animationOptions[Math.floor(Math.random() * animationOptions.length)];

        this.log(`Emotion: ${emotion} (${intensity.toFixed(2)}) -> Level: ${level} -> Animation: ${selectedAnimation}`);

        return selectedAnimation;
    }

    /**
     * Play an animation sequence based on the detected emotion
     * Handles animation queuing to prevent conflicts
     */
    playEmotionAnimation(emotion, intensity = 1.0) {
        // In Interview Mode, we suppress dramatic body animations (dance, jump, clap)
        // to maintain a professional "interviewer" posture.
        // Only allow subtle face-driven sitting expressions.
        if (this.isInterviewMode) {
            this.log(`[Interview] Suppressing body animation for ${emotion} (facial expression only)`);

            // Special case: if we have 'Sitting Laughing' and they are happy, we COULD play it,
            // but for a "real interviewer type" feel, keeping it to just face is often better.
            // Let's stick to face + the steady sitting pose.
            this.processEmotionQueue();
            return;
        }

        // Check if ANY animations are available first
        const availableAnimations = Object.keys(this.animations || {});
        if (availableAnimations.length === 0) {
            if (!this.warnedNoAnimations) {
                this.log(`⚠️ No animations in model - using facial expressions only`);
                this.log(`To add animations, load a model with animation clips (e.g., from Mixamo)`);
                this.warnedNoAnimations = true;
            }
            this.processEmotionQueue();
            return;
        }

        const animationName = this.getAnimationForEmotion(emotion, intensity);

        // For neutral/idle emotions — just smoothly loop idle, never mark as "playing emotion"
        if (animationName === 'idle' || emotion.toLowerCase() === 'neutral') {
            if (!this.isPlayingEmotionAnimation) {
                this.playAnimation('idle'); // looping, never gets stuck
            }
            this.processEmotionQueue();
            return;
        }

        // Don't interrupt if already playing a non-idle emotion animation
        if (this.isPlayingEmotionAnimation) {
            this.log(`Emotion animation already playing, queueing ${emotion}`);
            this.emotionAnimationQueue.push({ emotion, intensity });
            return;
        }

        // Check if this specific animation exists
        if (!this.animations[animationName]) {
            this.log(`Animation '${animationName}' not found, skipping emotion animation`);
            this.processEmotionQueue();
            return;
        }

        this.isPlayingEmotionAnimation = true;
        this.log(`Playing emotion animation: ${animationName} for ${emotion}`);

        // Play the animation once
        this.playAnimation(animationName, true);

        // Use the mixer 'finished' event to know when we're done (reliable, no polling loop)
        const onEmotionFinished = (e) => {
            if (e.action === this.animations[animationName]) {
                this.mixer.removeEventListener('finished', onEmotionFinished);
                this.isPlayingEmotionAnimation = false;
                this.log(`Emotion animation completed: ${animationName}`);

                // Return to idle if nothing active
                if (!this.isTalking) {
                    this.playAnimation('idle');
                }

                // Process next queued emotion
                this.processEmotionQueue();
            }
        };
        this.mixer.addEventListener('finished', onEmotionFinished);

        // Safety timeout: if mixer 'finished' never fires (e.g. clip issue), release the lock
        const safetyMs = ((this.animations[animationName]._clip &&
            this.animations[animationName]._clip.duration) || 4) * 1000 + 1000;
        setTimeout(() => {
            if (this.isPlayingEmotionAnimation) {
                this.mixer.removeEventListener('finished', onEmotionFinished);
                this.isPlayingEmotionAnimation = false;
                this.log(`Safety timeout released lock for: ${animationName}`);
                if (!this.isTalking) this.playAnimation('idle');
                this.processEmotionQueue();
            }
        }, safetyMs);
    }

    /**
     * Process the next emotion in the queue
     */
    processEmotionQueue() {
        if (this.emotionAnimationQueue.length > 0) {
            const next = this.emotionAnimationQueue.shift();
            // Small delay before next animation
            setTimeout(() => {
                this.playEmotionAnimation(next.emotion, next.intensity);
            }, 200);
        }
    }

    /**
     * Cancel any queued emotion animations
     * Useful when starting a new explicit animation or talking
     */
    clearEmotionQueue() {
        this.emotionAnimationQueue = [];
        this.log('Emotion animation queue cleared');
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();
        if (this.mixer) this.mixer.update(delta);

        this.renderer.render(this.scene, this.camera);
    }
    cleanAnimationClips(clip) {
        if (!clip) return;

        // Bone name mapping from Mixamo/Bip01 to Ready Player Me standard names
        const nameMap = {
            'Pelvis': 'Hips',
            'L_Thigh': 'LeftUpLeg', 'R_Thigh': 'RightUpLeg',
            'L_Calf': 'LeftLeg', 'R_Calf': 'RightLeg',
            'L_Foot': 'LeftFoot', 'R_Foot': 'RightFoot',
            'L_Toe0': 'LeftToeBase', 'R_Toe0': 'RightToeBase',
            'L_Clavicle': 'LeftShoulder', 'R_Clavicle': 'RightShoulder',
            'L_UpperArm': 'LeftArm', 'R_UpperArm': 'RightArm',
            'L_Forearm': 'LeftForeArm', 'R_Forearm': 'RightForeArm',
            'L_Hand': 'LeftHand', 'R_Hand': 'RightHand',
            'Spine1': 'Spine1', 'Spine2': 'Spine2',
            'Hips': 'Hips', 'Spine': 'Spine', 'Neck': 'Neck', 'Head': 'Head'
        };

        // Filter out tracks that cause the avatar to disappear:
        //  - Root-level position tracks (Hips.position moves the whole skeleton off-screen)
        //  - Any scale tracks from FBX (they override the model scale)
        // Uses case-insensitive regex to handle all Mixamo naming variations
        clip.tracks = clip.tracks.filter(track => {
            // Strip Mixamo prefixes first to read the real bone + property
            // Case-insensitive to catch: mixamorig:, mixamorig1:, Mixamorig:, etc.
            let cleanName = track.name
                .replace(/^mixamorig[0-9]*:?/gi, '')
                .replace(/^Bip01_/g, '')
                .replace(/\.bones\[.*\]/g, '');

            const parts = cleanName.split('.');
            const boneName = parts[0].toLowerCase();
            const prop = parts.length > 1 ? parts.slice(1).join('.').toLowerCase() : '';

            // REMOVE: root position tracks (moves avatar off-screen due to Mixamo root motion)
            if (boneName === 'hips' && prop.includes('position')) {
                console.log(`  ✂️ Stripped root position track: ${track.name}`);
                return false;
            }

            // REMOVE: any scale tracks (overrides model scale, causes avatar to shrink/vanish)
            if (prop.includes('scale')) {
                return false;
            }

            return true;
        });

        // Rename remaining tracks with clean bone names
        clip.tracks.forEach(track => {
            let name = track.name
                .replace(/^mixamorig[0-9]*:?/gi, '')
                .replace(/^Bip01_/g, '')
                .replace(/\.bones\[.*\]/g, '');

            const parts = name.split('.');
            let boneName = parts[0];
            const prop = parts.length > 1 ? '.' + parts.slice(1).join('.') : '';

            // Apply bone name mapping
            if (nameMap[boneName]) {
                boneName = nameMap[boneName];
            }

            track.name = boneName + prop;
        });
    }

    playRandomIdle() {
        const idles = ['idle', 'breathing', 'looking_around'];
        const available = idles.filter(name => this.animations[name]);
        if (available.length > 0) {
            const random = available[Math.floor(Math.random() * available.length)];
            this.playAnimation(random);
        } else {
            this.playAnimation('idle');
        }
    }

    // ─── Idle Eye System ────────────────────────────────────────────────────
    // Gives the avatar natural blinking + subtle eye look-around during idle.
    // Automatically stops when a non-idle animation plays.

    startIdleEyes() {
        if (this._eyeIdleRunning) return;
        this._eyeIdleRunning = true;
        this.log('👁 Idle eye system started');
        this._scheduleNextBlink();
        this._scheduleNextLook();
    }

    stopIdleEyes() {
        if (!this._eyeIdleRunning) return;
        this._eyeIdleRunning = false;
        clearTimeout(this._eyeBlinkTimeout);
        clearTimeout(this._eyeLookTimeout);
        if (this._eyeIdleFrame) cancelAnimationFrame(this._eyeIdleFrame);
        this._eyeIdleFrame = null;
        // Reset eye morph targets to 0
        this._setEyeMorph('eyeBlinkLeft', 0);
        this._setEyeMorph('eyeBlinkRight', 0);
        this._setEyeLook(0, 0); // centre
        this.log('👁 Idle eye system stopped');
    }

    // Set a single eye morph target by name (no-op if not present)
    _setEyeMorph(name, value) {
        if (!this.faceMesh || !this.morphTargetDictionary) return;
        const key = this.findMorphTarget(name);
        if (key === null) return;
        const idx = this.morphTargetDictionary[key];
        if (idx === undefined) return;
        this.faceMesh.morphTargetInfluences[idx] = Math.max(0, Math.min(1, value));
    }

    // Set eye look direction. inOutL/R: + = look in (nose), - = look out
    // upDown: + = look up, - = look down
    _setEyeLook(horizontal, vertical) {
        // Horizontal
        if (horizontal >= 0) {
            this._setEyeMorph('eyeLookInLeft', horizontal);
            this._setEyeMorph('eyeLookInRight', horizontal);
            this._setEyeMorph('eyeLookOutLeft', 0);
            this._setEyeMorph('eyeLookOutRight', 0);
        } else {
            this._setEyeMorph('eyeLookOutLeft', -horizontal);
            this._setEyeMorph('eyeLookOutRight', -horizontal);
            this._setEyeMorph('eyeLookInLeft', 0);
            this._setEyeMorph('eyeLookInRight', 0);
        }
        // Vertical
        if (vertical >= 0) {
            this._setEyeMorph('eyeLookUpLeft', vertical);
            this._setEyeMorph('eyeLookUpRight', vertical);
            this._setEyeMorph('eyeLookDownLeft', 0);
            this._setEyeMorph('eyeLookDownRight', 0);
        } else {
            this._setEyeMorph('eyeLookDownLeft', -vertical);
            this._setEyeMorph('eyeLookDownRight', -vertical);
            this._setEyeMorph('eyeLookUpLeft', 0);
            this._setEyeMorph('eyeLookUpRight', 0);
        }
    }

    // Schedule the next random blink
    _scheduleNextBlink() {
        if (!this._eyeIdleRunning) return;
        // Blink every 2–5 seconds randomly
        const delay = 2000 + Math.random() * 3000;
        this._eyeBlinkTimeout = setTimeout(() => {
            if (!this._eyeIdleRunning) return;
            this._doBlink();
        }, delay);
    }

    // Animate a natural blink
    _doBlink() {
        if (!this._eyeIdleRunning) return;
        const BLINK_MS = 120;   // close
        const OPEN_MS = 100;   // reopen
        const startClose = performance.now();

        const closeStep = () => {
            if (!this._eyeIdleRunning) return;
            const t = Math.min(1, (performance.now() - startClose) / BLINK_MS);
            this._setEyeMorph('eyeBlinkLeft', t);
            this._setEyeMorph('eyeBlinkRight', t);
            if (t < 1) {
                this._eyeIdleFrame = requestAnimationFrame(closeStep);
            } else {
                // Fully closed — now open
                const startOpen = performance.now();
                const openStep = () => {
                    if (!this._eyeIdleRunning) return;
                    const t2 = Math.min(1, (performance.now() - startOpen) / OPEN_MS);
                    this._setEyeMorph('eyeBlinkLeft', 1 - t2);
                    this._setEyeMorph('eyeBlinkRight', 1 - t2);
                    if (t2 < 1) {
                        this._eyeIdleFrame = requestAnimationFrame(openStep);
                    } else {
                        // Schedule next blink
                        this._scheduleNextBlink();
                    }
                };
                this._eyeIdleFrame = requestAnimationFrame(openStep);
            }
        };
        this._eyeIdleFrame = requestAnimationFrame(closeStep);
    }

    // Schedule a gentle random eye look shift
    _scheduleNextLook() {
        if (!this._eyeIdleRunning) return;
        // New look direction every 1.5–4 seconds
        const delay = 1500 + Math.random() * 2500;
        this._eyeLookTimeout = setTimeout(() => {
            if (!this._eyeIdleRunning) return;
            this._doLookShift();
        }, delay);
    }

    // Smoothly shift eyes to a new random look position
    _doLookShift() {
        if (!this._eyeIdleRunning) return;
        // Emotion-biased look targets — eyes shift in emotionally appropriate directions
        const emotionBias = {
            'sad': { h: 0.00, v: -0.15 },  // downcast — looking at floor
            'sadness': { h: 0.00, v: -0.15 },
            'depressed': { h: 0.00, v: -0.20 },
            'happy': { h: 0.05, v: 0.10 },  // bright upward, slightly outward
            'joy': { h: 0.05, v: 0.12 },
            'excited': { h: 0.08, v: 0.10 },  // wide open, outward
            'thinking': { h: -0.12, v: 0.10 },  // classic thinking: up-left
            'confused': { h: 0.08, v: 0.00 },  // sideways glance
            'surprised': { h: 0.00, v: 0.15 },  // wide up
            'angry': { h: 0.00, v: -0.08 },  // slightly down, intense
            'love': { h: -0.02, v: 0.08 },  // soft upward gaze
        };

        const bias = emotionBias[this.currentEmotion] || { h: 0, v: 0 };

        // Random wander around the bias point
        const wander = 0.15;
        const wanderV = 0.10;
        const rawH = bias.h + (Math.random() - 0.5) * wander;
        const rawV = bias.v + (Math.random() - 0.5) * wanderV;

        // Clamp to reasonable range
        const targetH = Math.max(-0.25, Math.min(0.25, rawH));
        const targetV = Math.max(-0.25, Math.min(0.20, rawV));

        const SHIFT_MS = 450;
        const startTime = performance.now();
        const curH = (this._curEyeH !== undefined) ? this._curEyeH : 0;
        const curV = (this._curEyeV !== undefined) ? this._curEyeV : 0;

        const shiftStep = () => {
            if (!this._eyeIdleRunning) return;
            const t = Math.min(1, (performance.now() - startTime) / SHIFT_MS);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const h = curH + (targetH - curH) * eased;
            const v = curV + (targetV - curV) * eased;
            this._setEyeLook(h, v);
            if (t < 1) {
                this._eyeIdleFrame = requestAnimationFrame(shiftStep);
            } else {
                this._curEyeH = targetH;
                this._curEyeV = targetV;
                this._scheduleNextLook();
            }
        };
        this._eyeIdleFrame = requestAnimationFrame(shiftStep);
    }
}
