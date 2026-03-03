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
        this.faceMesh = null; // Store mesh with morph targets
        this.morphTargetDictionary = {}; // Store name to index mapping
        this.currentEmotion = 'neutral'; // Track current emotion state
        this.emotionAnimationQueue = []; // Queue for emotion-triggered animations
        this.isPlayingEmotionAnimation = false; // Track if emotion animation is playing
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
        const controls = new OrbitControls(this.camera, this.renderer.domElement);
        controls.target.set(0, 100, 0);
        controls.update();

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
            'idle': 'Catwalk Walk Turn 180 Tight.fbx',  // Use walk as idle
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

        // Fallback
        if (!this.animations[name]) {
            console.warn(`Animation ${name} not found.`);
            return;
        }

        const action = this.animations[name];
        if (this.currentAction !== action) {
            if (this.currentAction) this.currentAction.fadeOut(0.5);

            action.reset().fadeIn(0.5);
            action.clampWhenFinished = true;

            if (loopOnce) {
                action.setLoop(THREE.LoopOnce);
                // When finished, go back to idle
                this.mixer.addEventListener('finished', (e) => {
                    if (e.action === action) {
                        this.playAnimation('idle');
                    }
                });
            } else {
                action.setLoop(THREE.LoopRepeat);
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
        // If we have face animations, we don't rely on this boolean as much for jaw movement
        if (!talking) {
            // Reset face if needed
            this.resetFace();
        }
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
                // Trigger body animation after facial transition completes
                if (triggerAnimation && targetEmotion !== 'neutral') {
                    this.playEmotionAnimation(targetEmotion, 1.0);
                }
            }
        };

        requestAnimationFrame(animate);
    }

    resetFace() {
        if (!this.faceMesh) return;
        // Smoothly reset to neutral
        this.transitionToEmotion("neutral", 300, false); // Don't trigger body animation on reset
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
        // Check if ANY animations are available first
        const availableAnimations = Object.keys(this.animations || {});
        if (availableAnimations.length === 0) {
            if (!this.warnedNoAnimations) {
                this.log(`⚠️ No animations in model - using facial expressions only`);
                this.log(`To add animations, load a model with animation clips (e.g., from Mixamo)`);
                this.warnedNoAnimations = true;
            }
            this.processEmotionQueue(); // Clear queue since we can't play animations
            return;
        }

        // Don't interrupt if already playing an emotion animation
        if (this.isPlayingEmotionAnimation) {
            this.log(`Emotion animation already playing, queueing ${emotion}`);
            this.emotionAnimationQueue.push({ emotion, intensity });
            return;
        }

        const animationName = this.getAnimationForEmotion(emotion, intensity);

        // Check if this specific animation exists
        if (!this.animations[animationName]) {
            this.log(`Animation '${animationName}' not found, skipping emotion animation`);
            this.processEmotionQueue(); // Try next in queue
            return;
        }

        this.isPlayingEmotionAnimation = true;
        this.log(`Playing emotion animation: ${animationName} for ${emotion}`);

        // Play the animation once
        this.playAnimation(animationName, true);

        // Set up completion handler
        // Animations typically last 2-4 seconds, we'll wait for the mixer to signal completion
        const checkCompletion = () => {
            if (this.currentAction && this.currentAction.isRunning()) {
                // Still running, check again
                requestAnimationFrame(checkCompletion);
            } else {
                // Animation finished
                this.isPlayingEmotionAnimation = false;
                this.log(`Emotion animation completed: ${animationName}`);

                // Return to idle if nothing is happening
                if (!this.isTalking) {
                    this.playAnimation('idle');
                }

                // Process next queued emotion if any
                this.processEmotionQueue();
            }
        };

        // Start checking for completion after a short delay
        setTimeout(() => requestAnimationFrame(checkCompletion), 100);
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
        // diverse idle animations if available
        const idles = ['idle', 'breathing', 'looking_around']; // hypothetical
        const available = idles.filter(name => this.animations[name]);
        if (available.length > 0) {
            const random = available[Math.floor(Math.random() * available.length)];
            this.playAnimation(random);
        } else {
            this.playAnimation('idle');
        }
    }
}
