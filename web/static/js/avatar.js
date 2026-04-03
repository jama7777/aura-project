// AURA AVATAR SYSTEM - GLOBAL SCRIPT VERSION
class AuraAvatar {
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

        // Round-robin tracker: { emotionKey: currentIndex }
        // Ensures the same animation isn't picked twice in a row for the same emotion
        this._emotionAnimCounter = {};

        // Dynamic Idle configuration
        this.defaultIdleAnimation = 'idle';

        // Lip Sync State
        this.faceAnimationFrames = [];
        this.faceAnimationStartTime = 0;
        this.faceAnimationActive = false;
        this.faceAnimationCurrentIndex = 0;

        // Interview Mode: Lock avatar position
        this.isInterviewMode = false;
        this.lockedModelPosition = { x: 0, y: -75, z: 0 };
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
        this.scene.background = new THREE.Color(0x020205);

        // Dynamic 3D Environment Setup
        this.createStarfield();
        this.createPlanet();
        this.createOfficeEnvironment(); // Desk and chair

        // Camera - position for a centered portrait view
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
        this.camera.position.set(0, 10, 300); // Further back, slightly up

        // Lights
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
        hemiLight.position.set(0, 200, 0);
        this.scene.add(hemiLight);

        // DIR Light
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(0, 200, 100);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);

        // Controls - LOCKED for a cinematic fixed view
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 0, 0); // Focus on avatar center
        this.controls.enableRotate = false; // Locked
        this.controls.enableZoom = false;   // Locked
        this.controls.enablePan = false;    // Locked
        this.controls.update();

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

    /** Common post-load setup shared by initial load */
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
        this.faceMeshes = []; // Initialize correctly
        this.jawBone = null;
        this.headBone = null;
        this.morphTargetDictionary = {};

        object.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.morphTargetInfluences && child.morphTargetDictionary) {
                    this.faceMeshes.push(child);
                    if (!this.faceMesh) {
                        this.faceMesh = child;
                    }
                    if (Object.keys(this.morphTargetDictionary).length === 0) {
                        this.morphTargetDictionary = child.morphTargetDictionary;
                    }
                }
            }
            if (child.isBone) {
                const n = child.name.toLowerCase();
                if (n.includes('jaw')) {
                    this.log(`Found Jaw Bone: ${child.name}`);
                    this.jawBone = child;
                } else if (n.includes('head') && !this.headBone) {
                    this.log(`Found Head Bone: ${child.name}`);
                    this.headBone = child;
                }
            }
        });

        if (this.faceMeshes.length > 0) {
            this.log(`✓ Mesh setup complete! Found ${this.faceMeshes.length} meshes with morph targets.`);
        }
        this.scene.add(object);
        this.model = object;

        // Load animations
        if (animations && animations.length > 0) {
            animations.forEach(clip => {
                this.animations[clip.name] = this.mixer.clipAction(clip);
            });
        }
        this.loadFBXAnimations();

        this.log(`✅ Avatar model loaded.`);
    }



    setIdleAnimation(animName) {
        if (this.animations[animName]) {
            this.defaultIdleAnimation = animName;
            if (!this.isPlayingEmotionAnimation) {
                this.playAnimation(animName);
            }
        } else {
            this.log(`Attempted to set idle to unknown animation: ${animName}`);
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
                        if (Object.keys(this.morphTargetDictionary).length === 0) {
                            this.morphTargetDictionary = child.morphTargetDictionary;
                        }
                    }
                }
            });

            // Extract Animations if present
            if (animations && animations.length > 0) {
                animations.forEach(clip => {
                    this.cleanAnimationClips(clip);
                    this.animations[clip.name] = this.mixer.clipAction(clip);
                });
                this.playAnimation(this.defaultIdleAnimation) || (animations[0] && this.playAnimation(animations[0].name));
            }
        };

        if (extension === 'fbx') {
            const loader = new THREE.FBXLoader(manager);
            loader.load(url, onLoaded, undefined, (err) => this.log("Error loading FBX: " + err));
        } else if (extension === 'glb') {
            const loader = new THREE.GLTFLoader(manager);
            loader.load(url, onLoaded, undefined, (err) => this.log("Error loading GLB: " + err));
        } else {
            // OBJ fallback handled differently if needed
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
        const gltfLoader = new THREE.GLTFLoader(loadingManager);
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
            this.faceMeshes = [];
            object.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    // Check for Morph Targets (ARKit blendshapes)
                    if (child.morphTargetInfluences && child.morphTargetDictionary) {
                        this.log(`Found Face Mesh: ${child.name} with ${Object.keys(child.morphTargetDictionary).length} morphs`);
                        this.faceMeshes.push(child);
                        // Populate the master dictionary from the FIRST mesh found
                        if (Object.keys(this.morphTargetDictionary).length === 0) {
                            this.morphTargetDictionary = child.morphTargetDictionary;
                        }
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
            if (this.faceMeshes.length > 0) {
                this.log(`✓ Morph targets ready for lip sync! (${this.faceMeshes.length} meshes)`);
                this.faceMesh = this.faceMeshes[0]; // backward compatibility
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
            });
    }

    createStarfield() {
        const starsGeometry = new THREE.BufferGeometry();
        const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0.8 });

        const starsVertices = [];
        for (let i = 0; i < 3000; i++) {
            const x = THREE.MathUtils.randFloatSpread(4000);
            const y = THREE.MathUtils.randFloatSpread(4000);
            const z = THREE.MathUtils.randFloatSpread(4000);
            if (Math.abs(x) < 500 && Math.abs(y) < 500 && Math.abs(z) < 500) continue;
            starsVertices.push(x, y, z);
        }

        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
        this.starField = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(this.starField);
    }

    createPlanet() {
        const planetGeom = new THREE.SphereGeometry(1500, 64, 64);
        const planetMat = new THREE.MeshPhongMaterial({
            color: 0x1a2b4c,
            emissive: 0x051020,
            specular: 0x555555,
            shininess: 20
        });

        this.planet = new THREE.Mesh(planetGeom, planetMat);
        this.planet.position.set(0, -1575, 0);
        this.planet.receiveShadow = true;
        this.scene.add(this.planet);

        const atmosGeom = new THREE.SphereGeometry(1520, 64, 64);
        const atmosMat = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.1,
            side: THREE.BackSide
        });
        const atmos = new THREE.Mesh(atmosGeom, atmosMat);
        atmos.position.set(0, -1575, 0);
        this.scene.add(atmos);
    }

    createOfficeEnvironment() {
        // --- 1. THE DESK ---
        const deskGroup = new THREE.Group();
        this.desk = deskGroup;
        
        // Desk Top (Glass/High-tech surface)
        const topGeom = new THREE.BoxGeometry(350, 8, 120);
        const topMat = new THREE.MeshPhongMaterial({ 
            color: 0x111122, 
            transparent: true, 
            opacity: 0.8,
            shininess: 100,
            specular: 0x5555ff 
        });
        const top = new THREE.Mesh(topGeom, topMat);
        top.position.y = -5; // Height relative to sitting avatar
        top.position.z = 40; // Front of avatar
        deskGroup.add(top);

        // Desk "Legs" / Base (Cyberpunk style pillars)
        const baseGeom = new THREE.CylinderGeometry(5, 15, 80, 4);
        const baseMat = new THREE.MeshPhongMaterial({ color: 0x050510 });
        
        const leg1 = new THREE.Mesh(baseGeom, baseMat);
        leg1.position.set(-140, -45, 40);
        deskGroup.add(leg1);
        
        const leg2 = new THREE.Mesh(baseGeom, baseMat);
        leg2.position.set(140, -45, 40);
        deskGroup.add(leg2);

        // Neon Trim
        const neonGeom = new THREE.BoxGeometry(352, 1, 1);
        const neonMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
        const neon = new THREE.Mesh(neonGeom, neonMat);
        neon.position.set(0, -2, 100);
        deskGroup.add(neon);

        this.scene.add(deskGroup);
        deskGroup.visible = false; // Start hidden

        // --- 2. THE CHAIR ---
        const chairGroup = new THREE.Group();
        this.chair = chairGroup;

        // Seat
        const seatGeom = new THREE.BoxGeometry(80, 10, 80);
        const seatMat = new THREE.MeshPhongMaterial({ color: 0x222233 });
        const seat = new THREE.Mesh(seatGeom, seatMat);
        seat.position.y = -55;
        chairGroup.add(seat);

        // Backrest
        const backGeom = new THREE.BoxGeometry(80, 100, 10);
        const back = new THREE.Mesh(backGeom, seatMat);
        back.position.set(0, -10, -40);
        chairGroup.add(back);

        this.scene.add(chairGroup);
        chairGroup.visible = false; // Start hidden
    }

    setEnvironmentMode(isInterview) {
        if (this.desk) this.desk.visible = isInterview;
        if (this.chair) this.chair.visible = isInterview;
        
        // Set interview mode and lock avatar position
        this.isInterviewMode = isInterview;
        if (isInterview && this.model) {
            // Store current position as locked position
            this.lockedModelPosition = {
                x: this.model.position.x,
                y: this.model.position.y,
                z: this.model.position.z
            };
            this.log(`✓ Interview Mode: Avatar position LOCKED at (${this.lockedModelPosition.x}, ${this.lockedModelPosition.y}, ${this.lockedModelPosition.z})`);
        } else {
            this.log(`✓ Home Mode: Avatar position unlocked`);
        }
        
        // Adjust camera slightly for sitting
        if (isInterview) {
            this.camera.position.set(0, 15, 250); // Punch in a bit
        } else {
            this.camera.position.set(0, 10, 300); // Normal view
        }
    }

    loadFBXAnimations() {
        // ── Mixamo animations (high-quality rigged clips) ────────────────────
        const animationMap = {
            // ── Core / Idle ──────────────────────────────────────────────────
            'idle':          'Catwalk Idle To Twist R.fbx',
            'walk_turn':     'Catwalk Walk Turn 180 Tight.fbx',
            'walk_turn2':    'Catwalk Walk Turn 180 Tight-2.fbx',
            'jog':           'Jog In Circle.fbx',
            'talking':       'Talking.fbx',

            // ── Interview / Sitting ──────────────────────────────────────────
            'sitting':       'Sitting_interview_position@1.fbx',
            'sitting_laugh': 'Sitting Laughing.fbx',

            // ── Happy / Excited ──────────────────────────────────────────────
            'happy':         'Happy.fbx',
            'dance':         'Hip Hop Dancing.fbx',
            'dance2':        'Hip Hop Dancing-2.fbx',
            'clap':          'Clapping.fbx',
            'greet':         'Standing Greeting.fbx',
            'crouch':        'Crouch To Stand.fbx',

            // ── Sad / Defeated ───────────────────────────────────────────────
            'sad':           'Defeated.fbx',
            'hug':           'Sitting Laughing.fbx',
            'pray':          'Praying.fbx',

            // ── Angry / Fight ────────────────────────────────────────────────
            'angry':         'Angry.fbx',
            'fight':         'Standing Idle To Fight Idle.fbx',
            'taunt':         'Taunt.fbx',

            // ── Jump / Surprise ──────────────────────────────────────────────
            'jump':          'Jumping Down.fbx',
        };

        const fbxLoader = new THREE.FBXLoader();
        let loadedCount = 0;
        let attemptCount = 0;
        const totalAnimations = Object.keys(animationMap).length;

        this.log(`Loading ${totalAnimations} FBX animations...`);
        
        const checkStartupState = () => {
            if (attemptCount >= totalAnimations) {
                this.log(`🎉 Animations processed: Load=${loadedCount}, Fail=${attemptCount - loadedCount}. Done!`);
                this.log(`Available: ${Object.keys(this.animations).join(', ')}`);

                // Start with idle animation
                if (this.animations[this.defaultIdleAnimation]) {
                    this.playAnimation(this.defaultIdleAnimation);
                } else if (this.animations['idle']) {
                    this.playAnimation('idle');
                }
            }
        };

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
                    attemptCount++;
                    checkStartupState();
                },
                (progress) => {},
                (error) => {
                    this.log(`❌ Error loading: ${animName} from ${fileName}`);
                    attemptCount++;
                    checkStartupState();
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
        
        // Robust check for "currently performing" state
        const isActuallyRunning = this.currentAction && 
                                  this.currentAction.isRunning() && 
                                  this.currentAction.getEffectiveWeight() > 0.5;
        
        const shouldSwitch = loopOnce || (this.currentAction !== action) || !isActuallyRunning;

        if (shouldSwitch) {
            if (this.currentAction && this.currentAction !== action) {
                this.currentAction.fadeOut(0.3);
            }

            // ── MANAGE LISTENERS ──
            if (this._animationFinishHandler) {
                this.mixer.removeEventListener('finished', this._animationFinishHandler);
                this._animationFinishHandler = null;
            }
            if (this._finishedTimeout) {
                clearTimeout(this._finishedTimeout);
                this._finishedTimeout = null;
            }

            if (loopOnce) {
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
                
                this._animationFinishHandler = (e) => {
                    if (e.action === action) {
                        this.mixer.removeEventListener('finished', this._animationFinishHandler);
                        this._animationFinishHandler = null;
                        this.log(`Animation finished: ${name}`);
                        
                        this.isPlayingEmotionAnimation = false;
                        if (this._finishedTimeout) {
                            clearTimeout(this._finishedTimeout);
                            this._finishedTimeout = null;
                        }
                        
                        this.playAnimation(this.defaultIdleAnimation);
                        this.processEmotionQueue();
                    }
                };
                this.mixer.addEventListener('finished', this._animationFinishHandler);

                // Safety timeout (12s)
                this._finishedTimeout = setTimeout(() => {
                    if (this.isPlayingEmotionAnimation) {
                        this.log(`ANIMATION TIMEOUT: Force reset for ${name}`);
                        this.isPlayingEmotionAnimation = false;
                        this.playAnimation(this.defaultIdleAnimation);
                    }
                }, 12000);

                this.isPlayingEmotionAnimation = true;
                this.stopIdleEyes();
            } else if (name === this.defaultIdleAnimation || name === 'idle') {
                action.setLoop(THREE.LoopPingPong);
                action.clampWhenFinished = false;
                this.isPlayingEmotionAnimation = false;
                setTimeout(() => this.startIdleEyes(), 300);
            } else {
                action.setLoop(THREE.LoopRepeat);
                this.isPlayingEmotionAnimation = false;
                this.stopIdleEyes();
            }

            if (!loopOnce) {
                this.defaultIdleAnimation = name;
            }

            action.reset().fadeIn(0.3);
            action.play();
            this.currentAction = action;

            this._showAnimBadge(name);
        }   // end if(shouldSwitch)
    }   // end playAnimation()

    /**
     * Shows a small floating badge so you can SEE which animation is playing.
     * Teal  = CMU real mocap   |   Purple = Mixamo
     */
    _showAnimBadge(name) {
        let badge = document.getElementById('aura-anim-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'aura-anim-badge';
            badge.style.cssText = [
                'position:fixed', 'bottom:12px', 'right:14px',
                'background:rgba(15,15,30,0.88)', 'color:#a29bfe',
                'font-size:11px', 'font-weight:700', 'letter-spacing:0.5px',
                'padding:5px 14px', 'border-radius:20px', 'z-index:9999',
                'pointer-events:none', 'backdrop-filter:blur(6px)',
                'border:1px solid rgba(162,155,254,0.35)',
                'box-shadow:0 2px 12px rgba(108,92,231,0.4)',
                'transition:opacity 0.4s ease', 'font-family:monospace'
            ].join(';');
            document.body.appendChild(badge);
        }
        const label = name + ' | 🎭 Mixamo';
        badge.textContent = '▶ ' + label;
        badge.style.color = '#a29bfe';
        badge.style.opacity = '1';
        clearTimeout(badge._t);
        badge._t = setTimeout(() => { badge.style.opacity = '0.35'; }, 3500);
    }

    playIntroSequence() {
        this.log("Playing Intro Sequence...");
        const sequence = ['dance', 'happy', 'sad', 'jump', 'pray', 'clap'];
        this.playSequence(sequence, () => {
            this.log("Intro complete. Switching to Idle.");
            this.playAnimation(this.defaultIdleAnimation);
        });
    }

    playSequence(sequence, onComplete) {
        let index = 0;
        this.isPlayingEmotionAnimation = true;
        this.stopIdleEyes();

        const playNext = () => {
            if (index >= sequence.length) {
                this.isPlayingEmotionAnimation = false;
                if (onComplete) onComplete();
                if (this.processEmotionQueue) this.processEmotionQueue();
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

        const startInfluences = [...this.faceMeshes[0].morphTargetInfluences];
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
                    this.faceMeshes.forEach(mesh => {
                        if (mesh.morphTargetInfluences.length > i) {
                            mesh.morphTargetInfluences[i] = startInfluences[i] * (1 - eased);
                        }
                    });
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
        if (this.faceMeshes && this.faceMeshes.length > 0 && this.morphTargetDictionary) {
            hasMorphs = true;
            for (const [name, value] of Object.entries(blendshapes)) {
                // Try to find a matching key in the dictionary
                let match = this.findMorphTarget(name);

                if (match !== null) {
                    this.faceMeshes.forEach(mesh => {
                        const dict = mesh.morphTargetDictionary;
                        if (dict && match in dict) {
                            const index = dict[match];
                            if (mesh.morphTargetInfluences.length > index) {
                                mesh.morphTargetInfluences[index] = value;
                            }
                        }
                    });
                }
            }
        }

        // Fallback: Bone Rotation if no morphs found (or even if found, for extra effect)
        // If we have a jaw bone, rotate it based on 'jawOpen' (case-insensitive lookup)
        let jawValue = 0;
        for (const key in blendshapes) {
            if (key.toLowerCase() === 'jawopen') {
                jawValue = blendshapes[key];
                break;
            }
        }

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
        // Mapping from ACE names to standard RPM / ARKit names
        const aceToRpmMap = {
            'jawOpen': 'jawOpen',
            'jawForward': 'jawForward',
            'jawLeft': 'jawLeft',
            'jawRight': 'jawRight',
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
            'mouthRollLower': 'mouthRollLower',
            'mouthRollUpper': 'mouthRollUpper',
            'mouthShrugLower': 'mouthShrugLower',
            'mouthShrugUpper': 'mouthShrugUpper',
            'mouthLowerDownLeft': 'mouthLowerDownLeft',
            'mouthLowerDownRight': 'mouthLowerDownRight',
            'eyeBlinkLeft': 'eyeBlinkLeft',
            'eyeBlinkRight': 'eyeBlinkRight',
            'eyeBlink_L': 'eyeBlinkLeft',
            'eyeBlink_R': 'eyeBlinkRight',
            'cheekPuff': 'cheekPuff',
            'browDownLeft': 'browDownLeft',
            'browDownRight': 'browDownRight',
            'browInnerUp': 'browInnerUp',
            'browOuterUpLeft': 'browOuterUpLeft',
            'browOuterUpRight': 'browOuterUpRight'
        };

        const mapped = aceToRpmMap[aceName];
        if (mapped) return mapped;

        // Try _L/_R to Left/Right conversion (common for ARKit models)
        if (aceName.endsWith("_L")) return aceName.replace("_L", "Left");
        if (aceName.endsWith("_R")) return aceName.replace("_R", "Right");

        return aceName;
    }

    applyEmotionModifiers(emotion, blendshapes) {
        // Reduced factors to prevent over-exaggerated "mouth spread" and uncanny valley effects.
        const STRONG = 0.45;
        const MEDIUM = 0.3;
        const LIGHT = 0.15;

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
            // ... (rest of cases remain same but use the new constants) ...
            case "angry":
            case "anger":
            case "frustrated":
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
                blendshapes["browInnerUp"] = (blendshapes["browInnerUp"] || 0) + STRONG;
                blendshapes["mouthFrownLeft"] = (blendshapes["mouthFrownLeft"] || 0) + MEDIUM;
                blendshapes["mouthFrownRight"] = (blendshapes["mouthFrownRight"] || 0) + MEDIUM;
                blendshapes["eyeBlinkLeft"] = (blendshapes["eyeBlinkLeft"] || 0) + LIGHT;
                blendshapes["eyeBlinkRight"] = (blendshapes["eyeBlinkRight"] || 0) + LIGHT;
                blendshapes["mouthPucker"] = (blendshapes["mouthPucker"] || 0) + LIGHT;
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
                blendshapes["eyeWideLeft"] = (blendshapes["eyeWideLeft"] || 0) + STRONG;
                blendshapes["eyeWideRight"] = (blendshapes["eyeWideRight"] || 0) + STRONG;
                blendshapes["browInnerUp"] = (blendshapes["browInnerUp"] || 0) + STRONG;
                blendshapes["mouthStretchLeft"] = (blendshapes["mouthStretchLeft"] || 0) + MEDIUM;
                blendshapes["mouthStretchRight"] = (blendshapes["mouthStretchRight"] || 0) + MEDIUM;
                blendshapes["jawOpen"] = (blendshapes["jawOpen"] || 0) + LIGHT;
                break;

            case "disgust":
            case "disgusted":
                blendshapes["noseSneerLeft"] = (blendshapes["noseSneerLeft"] || 0) + STRONG;
                blendshapes["noseSneerRight"] = (blendshapes["noseSneerRight"] || 0) + STRONG;
                blendshapes["mouthUpperUpLeft"] = (blendshapes["mouthUpperUpLeft"] || 0) + MEDIUM;
                blendshapes["mouthUpperUpRight"] = (blendshapes["mouthUpperUpRight"] || 0) + MEDIUM;
                blendshapes["browDownLeft"] = (blendshapes["browDownLeft"] || 0) + LIGHT;
                blendshapes["browDownRight"] = (blendshapes["browDownRight"] || 0) + LIGHT;
                break;

            case "love":
            case "loving":
                blendshapes["mouthSmileLeft"] = (blendshapes["mouthSmileLeft"] || 0) + MEDIUM;
                blendshapes["mouthSmileRight"] = (blendshapes["mouthSmileRight"] || 0) + MEDIUM;
                blendshapes["eyeBlinkLeft"] = (blendshapes["eyeBlinkLeft"] || 0) + LIGHT;
                blendshapes["eyeBlinkRight"] = (blendshapes["eyeBlinkRight"] || 0) + LIGHT;
                blendshapes["cheekSquintLeft"] = (blendshapes["cheekSquintLeft"] || 0) + LIGHT;
                blendshapes["cheekSquintRight"] = (blendshapes["cheekSquintRight"] || 0) + LIGHT;
                break;

            case "confused":
            case "puzzled":
                blendshapes["browOuterUpLeft"] = (blendshapes["browOuterUpLeft"] || 0) + MEDIUM;
                blendshapes["browDownRight"] = (blendshapes["browDownRight"] || 0) + LIGHT;
                blendshapes["mouthLeft"] = (blendshapes["mouthLeft"] || 0) + LIGHT;
                blendshapes["eyeSquintRight"] = (blendshapes["eyeSquintRight"] || 0) + LIGHT;
                break;

            case "thinking":
            case "thoughtful":
                blendshapes["eyeSquintLeft"] = (blendshapes["eyeSquintLeft"] || 0) + LIGHT;
                blendshapes["eyeSquintRight"] = (blendshapes["eyeSquintRight"] || 0) + LIGHT;
                blendshapes["browInnerUp"] = (blendshapes["browInnerUp"] || 0) + LIGHT;
                blendshapes["mouthPucker"] = (blendshapes["mouthPucker"] || 0) + LIGHT;
                blendshapes["mouthRight"] = (blendshapes["mouthRight"] || 0) + LIGHT;
                break;
        }

        // ── FINAL REFINEMENT & CLAMPING ──────────────────────────────────────
        for (const key in blendshapes) {
            // DAMPER: Reduce "width" blendshapes to prevent wide-mouth distortion
            if (key.includes("Stretch") || key.includes("Smile")) {
                blendshapes[key] *= 0.75; // Tone down the width by 25%
            }
            // Clamp strictly 0 to 1
            blendshapes[key] = Math.max(0, Math.min(1, blendshapes[key]));
        }
    }

    // Show emotion on face WITHOUT lip sync (for idle emotional state)
    showEmotion(emotion, intensity = 1.0, triggerAnimation = true) {
        if (!this.faceMesh || !this.morphTargetDictionary) return;

        // ── INTERRUPT any background recovery or current transition ──
        this._recoveryId++; 

        // ── CLEAN START: Reset face only if emotion changed ──
        if (this.currentEmotion !== emotion) {
            this.resetFace();
        }

        const blendshapes = {};
        this.applyEmotionModifiers(emotion, blendshapes);

        // Apply with intensity scaling
        for (const [name, value] of Object.entries(blendshapes)) {
            const match = this.findMorphTarget(name);
            if (match !== null) {
                const index = this.morphTargetDictionary[match];
                this.faceMeshes.forEach(mesh => {
                    if (mesh.morphTargetInfluences.length > index) {
                        mesh.morphTargetInfluences[index] = value * intensity;
                    }
                });
            }
        }

        this.currentEmotion = emotion;
        // this.log(`Showing emotion: ${emotion} (intensity: ${intensity})`);

        // Optionally trigger a matching body animation
        if (triggerAnimation) {
            this.playEmotionAnimation(emotion, intensity);
        }
    }

    // Animate transition between emotions
    transitionToEmotion(targetEmotion, duration = 500, triggerAnimation = true) {
        if (!this.faceMeshes || this.faceMeshes.length === 0) return;

        const startInfluences = [...this.faceMeshes[0].morphTargetInfluences];
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
                const newValue = startInfluences[i] + (targetInfluences[i] - startInfluences[i]) * eased;
                this.faceMeshes.forEach(mesh => {
                    if (mesh.morphTargetInfluences.length > i) {
                        mesh.morphTargetInfluences[i] = newValue;
                    }
                });
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
        if (!this.faceMeshes || this.faceMeshes.length === 0) return;
        // Zero out all morph targets immediately for clean reset after talking
        this.faceMeshes.forEach(mesh => {
            if (mesh.morphTargetInfluences) {
                for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
                    mesh.morphTargetInfluences[i] = 0;
                }
            }
        });
    }

    /**
     * Map emotions to appropriate body animations.
     * Uses a ROUND-ROBIN strategy so the same animation never plays twice in a row
     * for the same emotion — every trigger picks the NEXT clip in the pool.
     *
     * Pool structure:
     *   emotionAnimationMap[emotion][level] = [ ...animKey, ...animKey ]
     *
     * All animation keys must exist in the animationMap inside loadFBXAnimations().
     */
    getAnimationForEmotion(emotion, intensity = 1.0) {
        // ── Emotion → Animation pool mapping ──────────────────────────────────
        // Each emotion has a DISTINCT pool per intensity level.
        // Keys must match what's registered in loadFBXAnimations().
        const emotionAnimationMap = {
            // ── HAPPY / JOY ───────────────────────────────────────────────────
            'happy': {
                high:   ['dance', 'dance2', 'jump'],
                medium: ['happy', 'clap'],
                low:    ['greet', 'happy'],
            },
            'joy': {
                high:   ['dance2', 'dance', 'jump'],
                medium: ['clap', 'happy'],
                low:    ['greet', 'happy'],
            },

            // ── EXCITED ───────────────────────────────────────────────────────
            'excited': {
                high:   ['dance', 'jog', 'jump'],
                medium: ['clap', 'walk_turn'],
                low:    ['happy'],
            },

            // ── SAD / DEFEATED ────────────────────────────────────────────────
            'sad': {
                high:   ['sad', 'pray', 'crouch'],
                medium: ['sad'],
                low:    ['sad'],
            },

            // ── ANGRY / FIGHT ─────────────────────────────────────────────────
            'angry': {
                high:   ['angry', 'fight', 'taunt'],
                medium: ['angry', 'taunt'],
                low:    ['taunt'],
            },

            // ── SURPRISED ─────────────────────────────────────────────────────
            'surprised': {
                high:   ['jump', 'crouch'],
                medium: ['jump', 'walk_turn'],
                low:    ['walk_turn2'],
            },

            // ── GRATEFUL ──────────────────────────────────────────────────────
            'grateful': {
                high:   ['pray', 'hug', 'clap'],
                medium: ['pray', 'greet'],
                low:    ['greet'],
            },

            // ── LOVE ──────────────────────────────────────────────────────────
            'love': {
                high:   ['hug', 'happy', 'pray'],
                medium: ['hug', 'greet'],
                low:    ['greet'],
            },

            // ── THINKING / CONFUSED ───────────────────────────────────────────
            'thinking': {
                high:   ['talking', 'walk_turn2'],
                medium: ['talking', 'walk_turn'],
                low:    ['talking', 'idle'],
            },
            'confused': {
                high:   ['talking', 'walk_turn'],
                medium: ['talking', 'walk_turn2'],
                low:    ['idle'],
            },

            // ── FEAR / SCARED ─────────────────────────────────────────────────
            'fear': {
                high:   ['jog', 'jump', 'crouch'],
                medium: ['jog', 'crouch'],
                low:    ['walk_turn', 'sad'],
            },

            // ── NEUTRAL / IDLE ────────────────────────────────────────────────
            'neutral': {
                high:   ['idle', 'walk_turn'],
                medium: ['idle'],
                low:    ['idle'],
            },
        };

        // ── Determine intensity level ──────────────────────────────────────────
        let level = 'low';
        if (intensity >= 0.7)      level = 'high';
        else if (intensity >= 0.4) level = 'medium';

        // ── Resolve emotion key (normalise aliases) ────────────────────────────
        const alias = {
            'depressed': 'sad', 'unhappy': 'sad', 'grief': 'sad',
            'furious': 'angry', 'frustrated': 'angry', 'irritated': 'angry',
            'elated': 'excited', 'energetic': 'excited',
            'thankful': 'grateful', 'appreciative': 'grateful',
            'shocked': 'surprised', 'astonished': 'surprised',
            'scared': 'fear', 'anxious': 'fear',
            'affectionate': 'love', 'caring': 'love',
            'pondering': 'thinking', 'curious': 'thinking',
        };
        const emotionKey = alias[emotion.toLowerCase()] ?? emotion.toLowerCase();

        const emotionData = emotionAnimationMap[emotionKey];
        if (!emotionData) {
            this.log(`No animation mapping for emotion: ${emotion}, using neutral`);
            return 'idle';
        }

        // ── Build the candidate pool (filter to only loaded animations) ────────
        const rawPool = emotionData[level] || emotionData.medium || emotionData.low || ['idle'];
        const pool = rawPool.filter(name => !!this.animations[name]);
        if (pool.length === 0) {
            this.log(`No loaded animations available for ${emotion}/${level}, falling back to idle`);
            return 'idle';
        }

        // ── Round-robin: advance the counter for this emotion+level ───────────
        const counterKey = `${emotionKey}_${level}`;
        if (this._emotionAnimCounter[counterKey] === undefined) {
            this._emotionAnimCounter[counterKey] = 0;
        } else {
            this._emotionAnimCounter[counterKey] =
                (this._emotionAnimCounter[counterKey] + 1) % pool.length;
        }
        const selectedAnimation = pool[this._emotionAnimCounter[counterKey]];

        this.log(`🎭 Emotion: ${emotion} (${intensity.toFixed(2)}) | Level: ${level} | Pool: [${pool.join(', ')}] | Picked: ${selectedAnimation}`);

        return selectedAnimation;
    }

    /**
     * Play an animation sequence based on the detected emotion
     * Handles animation queuing to prevent conflicts
     */
    playEmotionAnimation(emotion, intensity = 1.0) {
        const availableAnimations = Object.keys(this.animations || {});
        if (availableAnimations.length === 0) return;

        const animationName = this.getAnimationForEmotion(emotion, intensity);

        // For neutral/idle emotions — just smoothly loop idle
        if (animationName === 'idle' || emotion.toLowerCase() === 'neutral') {
            if (!this.isPlayingEmotionAnimation) {
                this.playAnimation('idle'); 
            }
            return;
        }

        // ── INTERRUPT: Play immediately if the emotion changed ──
        // Removed the queuing logic to allow for real-time responsiveness.
        this.log(`Directly playing emotion animation: ${animationName} for ${emotion}`);
        this.playAnimation(animationName, true);
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

        try {
            const delta = this.clock.getDelta();
            if (this.mixer) this.mixer.update(delta);
        } catch (e) {
            console.error("Animation Mixer Update Error:", e);
        }

        // ── INTERVIEW MODE: Enforce position lock ──
        // During interview, keep avatar in sitting position (no movement across screen)
        if (this.isInterviewMode && this.model) {
            this.model.position.x = this.lockedModelPosition.x;
            this.model.position.y = this.lockedModelPosition.y;
            this.model.position.z = this.lockedModelPosition.z;
        }

        if (this.planet) {
            this.planet.rotation.y += 0.001; // slowly spin the planet
        }

        // Moving Space Effect (stars flying towards camera like a video)
        if (this.starField) {
            this.starField.rotation.y += 0.0002; // slow galaxy drift
            const positions = this.starField.geometry.attributes.position.array;
            for (let i = 2; i < positions.length; i += 3) {
                positions[i] += 4; // Move star forward along Z-axis
                if (positions[i] > 1000) {
                    positions[i] = -3000; // Reset star deep into the background when it passes camera
                }
            }
            this.starField.geometry.attributes.position.needsUpdate = true;
        }

        // --- Lip Sync Processing ---
        if (this.faceAnimationActive && this.faceAnimationFrames.length > 0) {
            const elapsed = (performance.now() - this.faceAnimationStartTime) / 1000;
            
            // Find the best frame (optimised search)
            let frame = null;
            while (this.faceAnimationCurrentIndex < this.faceAnimationFrames.length - 1 && 
                   this.faceAnimationFrames[this.faceAnimationCurrentIndex].time < elapsed) {
                this.faceAnimationCurrentIndex++;
            }
            frame = this.faceAnimationFrames[this.faceAnimationCurrentIndex];

            if (frame && frame.blendshapes) {
                this.updateFace(frame.blendshapes, this.currentEmotion);
            }

            // End of animation
            if (this.faceAnimationCurrentIndex >= this.faceAnimationFrames.length - 1 && 
                elapsed > this.faceAnimationFrames[this.faceAnimationFrames.length - 1].time + 0.1) {
                this.faceAnimationActive = false;
                this.log("[Lipsync] Finished playback.");
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    playFaceAnimation(frames) {
        if (!frames || frames.length === 0) return;
        this.faceAnimationFrames = frames;
        this.faceAnimationStartTime = performance.now();
        this.faceAnimationCurrentIndex = 0;
        this.faceAnimationActive = true;
        this.log(`[Lipsync] Starting playback of ${frames.length} frames.`);
    }
    cleanAnimationClips(clip) {
        if (!clip) return;

        // ── MIXAMO / Bip01 bone names → Ready Player Me ────────────────────────
        const mixamoToRPM = {
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
            'Hips': 'Hips', 'Spine': 'Spine',
            'Neck': 'Neck', 'Head': 'Head'
        };

        // ── CMU Mocap bone names → Ready Player Me ─────────────────────────────
        // CMU uses a different hierarchy exported by RancidMilk via Blender
        const cmuToRPM = {
            // Root / Hips
            'root': 'Hips',
            'Hips': 'Hips',
            // Spine chain
            'LowerBack': 'Spine',
            'Spine': 'Spine',
            'Spine1': 'Spine1',
            'Neck': 'Neck',
            'Neck1': 'Neck',
            'Head': 'Head',
            // Left Arm
            'LeftShoulder': 'LeftShoulder',
            'LeftArm': 'LeftArm',
            'LeftForeArm': 'LeftForeArm',
            'LeftHand': 'LeftHand',
            // Right Arm
            'RightShoulder': 'RightShoulder',
            'RightArm': 'RightArm',
            'RightForeArm': 'RightForeArm',
            'RightHand': 'RightHand',
            // Left Leg
            'LeftUpLeg': 'LeftUpLeg',
            'LeftLeg': 'LeftLeg',
            'LeftFoot': 'LeftFoot',
            'LeftToeBase': 'LeftToeBase',
            // Right Leg
            'RightUpLeg': 'RightUpLeg',
            'RightLeg': 'RightLeg',
            'RightFoot': 'RightFoot',
            'RightToeBase': 'RightToeBase',
        };

        // Combined map — Mixamo takes priority, CMU fills remaining
        const nameMap = { ...cmuToRPM, ...mixamoToRPM };

        // ── Strip root position tracks (moves avatar off-screen) ───────────────
        clip.tracks = clip.tracks.filter(track => {
            let cleanName = track.name
                .replace(/^mixamorig[0-9]*:?/gi, '')
                .replace(/^Bip01_/g, '')
                .replace(/\.bones\[.*\]/g, '');

            const parts = cleanName.split('.');
            const boneName = parts[0].toLowerCase();
            const prop = parts.length > 1 ? parts.slice(1).join('.').toLowerCase() : '';

            // Remove root position (causes avatar to fly off-screen)
            if ((boneName === 'hips' || boneName === 'root') && prop.includes('position')) {
                return false;
            }
            // Remove scale tracks
            if (prop.includes('scale')) {
                return false;
            }
            return true;
        });

        // ── MAP ACTUAL MODEL BONE NAMES (Dynamic Discovery) ──
        const modelBones = {};
        this.model.traverse(node => {
            if (node.isBone) {
                modelBones[node.name.toLowerCase()] = node.name;
                // Add cleaned version (remove armature/root prefixes)
                const clean = node.name.replace(/^(Armature|RootNode|Skeleton|AvatarRoot)_/i, '').toLowerCase();
                modelBones[clean] = node.name;
            }
        });

        // ── Rename bone tracks to match RPM skeleton ──────────────────────────
        clip.tracks.forEach(track => {
            let name = track.name
                .replace(/^mixamorig[0-9]*:?/gi, '')
                .replace(/^Bip01_/g, '')
                .replace(/\.bones\[.*\]/g, '');

            const parts = name.split('.');
            if (parts.length < 2) return;

            let boneName = parts[0].toLowerCase();
            const property = '.' + parts.slice(1).join('.');

            // Common Mixamo to RPM remapping
            const standardMap = {
                'pelvis': 'hips', 'hip': 'hips', 'l_hand': 'lefthand', 'r_hand': 'righthand'
            };
            if (standardMap[boneName]) boneName = standardMap[boneName];

            const actualBone = modelBones[boneName];
            if (actualBone) {
                track.name = actualBone + property;
            }
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

    /**
     * Updates the avatar's lip sync (jaw/mouth) values in real-time.
     * Incorporates smoothing (Physics LERP) for more natural results.
     */
    updateFace(targets) {
        if (!this.model || !this.faceMesh) return;
        
        // --- 1. SMOOTHING (LERP for Muscle Simulation) ---
        // Prevents robotic jittering by interpolating values
        this._lastJawVal = this._lastJawVal || 0;
        this._lastMouthVal = this._lastMouthVal || 0;
        
        // Inputs (from audio volume)
        const targetJaw = targets.jawOpen || 0;
        const targetMouth = targets.mouthOpen || 0;
        
        // Smoothing constant (0.1 = slower/heavy, 0.5 = snappy, 1.0 = instant/robotic)
        const SMOOTH = 0.42; 
        this._lastJawVal = THREE.MathUtils.lerp(this._lastJawVal, targetJaw, SMOOTH);
        this._lastMouthVal = THREE.MathUtils.lerp(this._lastMouthVal, targetMouth, SMOOTH);

        // --- 2. FUZZY TARGET MAPPING ---
        // Map common "jawOpen" and "mouthOpen" to whatever the model uses
        const activeTargets = {
            'jawOpen': this._lastJawVal,
            'mouthOpen': this._lastMouthVal * 0.75, // mouth usually expands less than jaw drops
            'mouthSmile': targets.smile || 0
        };

        // If the avatar has multiple face meshes (e.g. eyes, teeth, skin), apply to all
        const meshesToUpdate = this.faceMeshes || [this.faceMesh];
        
        meshesToUpdate.forEach(mesh => {
            const dict = mesh.morphTargetDictionary;
            const influ = mesh.morphTargetInfluences;
            if (!dict || !influ) return;

            // Fuzzy application for maximum model compatibility
            Object.entries(activeTargets).forEach(([key, val]) => {
                const lowerKey = key.toLowerCase();
                for (const dictKey in dict) {
                    const lowerDictKey = dictKey.toLowerCase();
                    // Match "jawOpen" with "jawOpen", "Jaw_Open", "vrc_jaw_open", etc.
                    if (lowerDictKey === lowerKey || 
                        lowerDictKey === lowerKey.replace('open', '') ||
                        lowerDictKey.includes(lowerKey)) {
                        influ[dict[dictKey]] = val;
                    }
                }
            });
        });
    }
}
