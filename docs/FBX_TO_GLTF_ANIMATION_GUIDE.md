# 🎬 FBX Animations on a GLB/GLTF Avatar — How AURA's Gesture Animation Studio Works

**Document Date**: February 24, 2026  
**Project**: AURA Virtual Friend  
**Topic**: How `.fbx` animation files are applied to the `.glb` (GLTF) avatar in the Gesture Animation Studio

---

## 🗂️ Table of Contents

1. [Overview — The Core Problem](#1-overview--the-core-problem)
2. [The Two File Formats Explained](#2-the-two-file-formats-explained)
3. [How to Run the Software](#3-how-to-run-the-software)
4. [What Happens When the Studio Loads](#4-what-happens-when-the-studio-loads)
5. [Step-by-Step: FBX → GLB Animation Pipeline](#5-step-by-step-fbx--glb-animation-pipeline)
6. [The `cleanAnimationClip()` Function — The Key Trick](#6-the-cleananimationclip-function--the-key-trick)
7. [Animation Map — Which FBX File Goes to Which Emotion](#7-animation-map--which-fbx-file-goes-to-which-emotion)
8. [Uploading Your Own FBX Animation](#8-uploading-your-own-fbx-animation)
9. [Using the Sequence Builder](#9-using-the-sequence-builder)
10. [Emotion → Gesture Mapping](#10-emotion--gesture-mapping)
11. [Common Problems & Fixes](#11-common-problems--fixes)
12. [File Locations Reference](#12-file-locations-reference)

---

## 1. Overview — The Core Problem

The AURA avatar is a **Ready Player Me (RPM) avatar** in `.glb` (GLTF) format.

The animations are **Mixamo animations** in `.fbx` format.

> ⚠️ **Problem**: These two formats speak different "languages".
> - The GLB avatar uses **small metric units** (1 unit = 1 meter, avatar is ~1.7 units tall)
> - The FBX animations use **centimeter units** (1 unit = 1 cm, avatar is ~170 units tall)
> - The bone names are **different** (FBX uses `mixamorig:Hips`, GLB uses `Hips`)
> - FBX root animations **move the model off-screen** if not stripped

**Solution**: In `gesture_studio.js`, we use Three.js to:
1. Load the GLB avatar at a scale of 100× to match FBX centimeter space
2. Load FBX animations, then **clean/retarget** them to match GLB bone names
3. Strip root-position and scale tracks that would break the avatar position
4. Attach the cleaned FBX animation clip to the GLB avatar's `AnimationMixer`

---

## 2. The Two File Formats Explained

### `.fbx` (Filmbox)
- **Made by**: Autodesk
- **Used for**: 3D animations, especially from Mixamo (Adobe's animation library)
- **Bone naming**: `mixamorig:Hips`, `mixamorig:Spine`, etc.
- **Coordinate system**: Centimeter-based (170 units = 1 human)
- **In AURA**: All 10 gesture animations are FBX files stored in `assets/animations/`

### `.glb` / `.gltf` (GL Transmission Format)
- **Made by**: Khronos Group (open standard)
- **Used for**: Web-optimized 3D models and avatars
- **Bone naming**: `Hips`, `Spine`, `LeftArm`, etc.
- **Coordinate system**: Meter-based (1.7 units = 1 human)
- **In AURA**: The avatar model `rpm_avatar.glb` is in this format

---

## 3. How to Run the Software

### Step 1: Open Terminal

### Step 2: Activate the Virtual Environment
```bash
cd /Users/indra/Documents/aura-project
source venv/bin/activate
```

### Step 3: Start the AURA Server
```bash
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### Step 4: Open the Gesture Animation Studio
In your browser, go to:
```
http://localhost:8000/gesture-studio
```

### Step 5: Wait for Loading
- First you'll see: `⏳ Loading avatar...`
- Then: `Loading animations... 1/10`, `2/10` ... `10/10`
- Finally: `🟢 Avatar Loaded` and `Ready — 10 animations`

---

## 4. What Happens When the Studio Loads

Here is the exact sequence of events when you open the Gesture Studio:

```
Browser opens /gesture-studio
       │
       ▼
  setupScene()
  ┌─────────────────────────────────────────┐
  │  Creates Three.js:                      │
  │  • Scene with dark background           │
  │  • Perspective camera at (0, 120, 350)  │
  │  • Lights (hemisphere + directional)    │
  │  • Ground plane + Grid helper           │
  │  • WebGL renderer                       │
  └─────────────────────────────────────────┘
       │
       ▼
  loadModel()  ← Uses GLTFLoader
  ┌──────────────────────────────────────────┐
  │  Loads: /assets/models/rpm_avatar.glb    │
  │  Sets scale: (100, 100, 100)             │  ← KEY! Matches FBX cm scale
  │  Creates: AnimationMixer bound to model  │
  │  Collects: All bone names for debugging  │
  └──────────────────────────────────────────┘
       │
       ▼
  loadAllFBXAnimations()  ← Uses FBXLoader
  ┌──────────────────────────────────────────┐
  │  Loops through 10 FBX files:             │
  │  For each FBX file:                      │
  │    1. Load from /assets/animations/      │
  │    2. Extract first AnimationClip        │
  │    3. Run cleanAnimationClip(clip)       │  ← The magic step
  │    4. Create AnimationAction on mixer    │
  │    5. Store in this.animations[name]     │
  └──────────────────────────────────────────┘
       │
       ▼
  onAllAnimationsLoaded()
  ┌─────────────────────────────────────────┐
  │  • Updates UI count ("10 animations")   │
  │  • Populates animation library cards    │
  │  • Shows emotion → gesture map          │
  │  • Auto-plays 'idle' animation          │
  └─────────────────────────────────────────┘
```

---

## 5. Step-by-Step: FBX → GLB Animation Pipeline

Here is exactly how one FBX file (e.g., `Hip Hop Dancing.fbx`) becomes a working animation on the GLB avatar:

### Step A: Load the FBX file
```javascript
const fbxLoader = new FBXLoader();
fbxLoader.load('/assets/animations/Hip Hop Dancing.fbx', (fbx) => {
    const clip = fbx.animations[0];  // Get the AnimationClip
    // ...
});
```
At this point, the clip's tracks look like:
```
mixamorig:Hips.position      ← root position (DANGEROUS — moves avatar off screen)
mixamorig:Hips.quaternion    ← hip rotation (KEEP)
mixamorig:Spine.quaternion   ← spine rotation (KEEP)
...etc
```

### Step B: Clean the Animation Clip
```javascript
this.cleanAnimationClip(clip);
```
After cleaning:
```
Hips.quaternion     ← renamed from mixamorig:Hips.quaternion
Spine.quaternion    ← renamed from mixamorig:Spine.quaternion
...etc
// mixamorig:Hips.position REMOVED (was causing avatar to fly off screen)
// all .scale tracks REMOVED (were overriding model scale)
```

### Step C: Attach to GLB Avatar's Mixer
```javascript
this.animations['dance'] = this.mixer.clipAction(clip);
```
Three.js `AnimationMixer` matches the track bone names (`Hips`, `Spine`, etc.) to the bones in the GLB avatar by name. Since we renamed them in Step B, they match!

### Step D: Play the Animation
```javascript
action.reset().fadeIn(0.5).play();
```
The mixer drives the GLB avatar's skeleton bones every frame using `this.mixer.update(deltaTime)` in the render loop.

---

## 6. The `cleanAnimationClip()` Function — The Key Trick

This function in `gesture_studio.js` is what makes FBX animations work on GLB avatars.

```javascript
cleanAnimationClip(clip) {
    // ── STEP 1: BONE NAME MAP ──
    // Mixamo FBX uses old/alternative bone names.
    // Ready Player Me GLB uses standard names.
    const nameMap = {
        'Pelvis':     'Hips',
        'L_Thigh':    'LeftUpLeg',   'R_Thigh':   'RightUpLeg',
        'L_Calf':     'LeftLeg',     'R_Calf':    'RightLeg',
        'L_Foot':     'LeftFoot',    'R_Foot':    'RightFoot',
        'L_Toe0':     'LeftToeBase', 'R_Toe0':    'RightToeBase',
        'L_Clavicle': 'LeftShoulder','R_Clavicle':'RightShoulder',
        'L_UpperArm': 'LeftArm',     'R_UpperArm':'RightArm',
        'L_Forearm':  'LeftForeArm', 'R_Forearm': 'RightForeArm',
        'L_Hand':     'LeftHand',    'R_Hand':    'RightHand',
        // etc.
    };

    // ── STEP 2: FILTER BAD TRACKS ──
    clip.tracks = clip.tracks.filter(track => {
        // Strip "mixamorig:" prefix to read the real bone name
        let cleanName = track.name
            .replace(/^mixamorig[0-9]*:?/gi, '')
            .replace(/^Bip01_/g, '');

        const parts = cleanName.split('.');
        const prop = parts[1]; // e.g., "position", "quaternion", "scale"

        // REMOVE root position track — this is what was making the avatar FLY OFF SCREEN
        if (parts[0] === 'Hips' && prop === 'position') {
            return false;  // ✂️ DELETE this track
        }

        // REMOVE all scale tracks — these override our model.scale.set(100,100,100)
        if (prop === 'scale') {
            return false;  // ✂️ DELETE this track
        }

        return true;  // ✅ Keep everything else
    });

    // ── STEP 3: RENAME REMAINING TRACKS ──
    clip.tracks.forEach(track => {
        let name = track.name
            .replace(/^mixamorig[0-9]*:?/gi, '')  // Remove "mixamorig:" prefix
            .replace(/^Bip01_/g, '');              // Remove "Bip01_" prefix

        const parts = name.split('.');
        let boneName = parts[0];
        const prop = parts[1] ? '.' + parts.slice(1).join('.') : '';

        // Apply name mapping (e.g., "Pelvis" → "Hips")
        if (nameMap[boneName]) {
            boneName = nameMap[boneName];
        }

        // Final track name: "Hips.quaternion", "Spine.quaternion", etc.
        track.name = boneName + prop;
    });
}
```

### Why the Hips.position Track is Dangerous

Mixamo root-motion animations **embed the character's world movement** into the `Hips.position` track.

For example, a "walk forward" animation has:
- Frame 0: Hips at position (0, 90, 0)  
- Frame 30: Hips at position (0, 90, 50)  ← moved 50 units forward

Since our avatar model is at position (0, 0, 0), when this track drives the skeleton, the avatar gets teleported 50 units away — **off camera or underground**.

**Fix**: Delete the position track entirely. The avatar stays at its origin and the legs/body still animate correctly (just without moving forward). This is standard "in-place" animation behaviour used in games and interactive 3D.

---

## 7. Animation Map — Which FBX File Goes to Which Emotion

This is defined in `gesture_studio.js` as `this.animationMap`:

| Emotion Key | FBX File | Duration |
|-------------|----------|----------|
| `idle` | `Catwalk Walk Turn 180 Tight.fbx` | ~3.4s |
| `happy` | `Sitting Laughing.fbx` | ~3.7s |
| `dance` | `Hip Hop Dancing.fbx` | ~8.4s |
| `dance2` | `Hip Hop Dancing-2.fbx` | ~8.4s |
| `clap` | `Clapping.fbx` | ~2.7s |
| `jump` | `Jumping Down.fbx` | ~1.8s |
| `sad` | `Defeated.fbx` | ~3.5s |
| `pray` | `Praying.fbx` | ~3.5s |
| `crouch` | `Crouch To Stand.fbx` | ~2.1s |
| `walk` | `Catwalk Walk Turn 180 Tight-2.fbx` | ~3.4s |

All 10 FBX files are stored in: `/assets/animations/`

---

## 8. Uploading Your Own FBX Animation

The studio has an **Upload FBX** button that lets you add any Mixamo FBX animation:

### Steps:
1. Go to [Mixamo.com](https://www.mixamo.com) (free with Adobe account)
2. Choose any animation
3. Download as **FBX** → select **"Without Skin"** (smaller file, animation only)
4. In the Gesture Studio, click **"⬆️ Upload FBX"**
5. Select your downloaded `.fbx` file
6. The animation is automatically:
   - Loaded with `FBXLoader`
   - Cleaned with `cleanAnimationClip()`
   - Added to the animation library
   - Previewed immediately on the avatar

### What Happens in Code:
```javascript
async uploadFBX(file) {
    const fbxLoader = new FBXLoader();
    const url = URL.createObjectURL(file);  // Temporary browser URL
    const name = file.name.replace('.fbx', '').toLowerCase();
    
    fbxLoader.load(url, (fbx) => {
        URL.revokeObjectURL(url);  // Free memory
        const clip = fbx.animations[0];
        this.cleanAnimationClip(clip);   // ← Same cleaning process
        this.animations[name] = this.mixer.clipAction(clip);
        this.playAnimation(name);         // Preview immediately
    });
}
```

---

## 9. Using the Sequence Builder

The Sequence Builder lets you chain multiple animations together with crossfades.

### How to Build a Sequence:
1. Click **"+ Seq"** button on any animation card in the library
2. The animation appears in the Sequence Timeline panel
3. You can:
   - **Reorder**: Click ▲ ▼ buttons to move items up/down
   - **Set duration**: Change the seconds for how long each animation plays
   - **Remove**: Click ✕ to remove from sequence
4. Click **"▶️ Play Sequence"** to watch it play
5. Enable **"Loop Sequence"** to repeat continuously
6. Enable **"Auto-Idle"** to return to idle animation after sequence ends

### Crossfade
Between each animation, the studio does a smooth **crossfade** (default 0.5 seconds) using Three.js:
```javascript
currentAction.fadeOut(0.5);      // Old animation fades out
nextAction.fadeIn(0.5).play();   // New animation fades in
```
This prevents jarring jumps between animations.

### Save / Export Sequence
- **Save**: Downloads a `.json` file with your sequence
- **Load**: Load a previously saved sequence
- **Export**: Export sequence in AURA-compatible format for integration

---

## 10. Emotion → Gesture Mapping

The studio shows how emotions detected by AURA map to gesture animations:

| Emotion Detected | Possible Gesture Animations |
|------------------|-----------------------------|
| `happy` | dance, clap, happy |
| `sad` | sad |
| `angry` | sad |
| `surprised` | jump |
| `love` | happy, pray |
| `grateful` | pray, clap |
| `excited` | dance, jump, clap |
| `neutral` | idle |

When AURA detects an emotion, it **randomly picks one** from the list for variety. You can test this in the **"🎭 Emotion Tester"** panel:
1. Click any emotion button (e.g., "😄 Happy")
2. The studio randomly picks a matching gesture
3. Plays it once, then returns to idle

---

## 11. Common Problems & Fixes

### ❌ Avatar Disappears When Animation Plays
**Cause**: The FBX animation has a `Hips.position` root motion track.  
**Fix**: Already handled by `cleanAnimationClip()` — it strips the position track.  
**If still happening**: Check the browser console for `✂️ Stripped root position track:` messages.

### ❌ Avatar Flies Off Screen
**Cause**: Scale tracks from FBX are overriding `model.scale.set(100, 100, 100)`.  
**Fix**: Already handled — scale tracks are removed in `cleanAnimationClip()`.

### ❌ Animation Plays But Bones Don't Move Correctly
**Cause**: Bone name mismatch between FBX and GLB.  
**Fix**: Check the browser console for bone names. Add missing mappings to `nameMap` in `cleanAnimationClip()`.

### ❌ "No animation data in file.fbx"
**Cause**: The FBX file was exported "With Skin" from Mixamo (model-only, no animation).  
**Fix**: Re-download from Mixamo and choose **"Without Skin"**.

### ❌ Avatar Not Loading At All
**Check**: Is the server running? Is `assets/models/rpm_avatar.glb` present?  
**Fix**: Run `uvicorn server:app --host 0.0.0.0 --port 8000 --reload` and check file exists.

### ❌ FBX Animation Looks Jerky
**Cause**: The animation was downloaded at too low a frame rate.  
**Fix**: Re-download from Mixamo at 30fps or 60fps.

---

## 12. File Locations Reference

```
aura-project/
│
├── assets/
│   ├── models/
│   │   └── rpm_avatar.glb          ← The GLB avatar (Ready Player Me)
│   │
│   └── animations/                  ← All FBX animation files
│       ├── Catwalk Walk Turn 180 Tight.fbx       (idle)
│       ├── Catwalk Walk Turn 180 Tight-2.fbx     (walk)
│       ├── Sitting Laughing.fbx                  (happy)
│       ├── Hip Hop Dancing.fbx                   (dance)
│       ├── Hip Hop Dancing-2.fbx                 (dance2)
│       ├── Clapping.fbx                          (clap)
│       ├── Jumping Down.fbx                      (jump)
│       ├── Defeated.fbx                          (sad)
│       ├── Praying.fbx                           (pray)
│       └── Crouch To Stand.fbx                   (crouch)
│
└── web/
    ├── gesture_studio.html          ← The Gesture Studio HTML page
    └── static/
        ├── css/
        │   └── gesture_studio.css   ← Gesture Studio styles
        └── js/
            └── gesture_studio.js    ← Gesture Studio logic (FBX→GLB pipeline)
```

---

## 🎯 Summary: The Complete FBX → GLB Flow

```
Mixamo Website
    │  Download animation as FBX (Without Skin)
    ▼
.fbx file  (e.g., Hip Hop Dancing.fbx)
    │  FBXLoader reads the file
    ▼
THREE.AnimationClip
    │  Contains tracks with names like "mixamorig:Hips.position"
    ▼
cleanAnimationClip()
    │  1. Strip "mixamorig:" prefix from all track names
    │  2. DELETE Hips.position (root motion) — prevents avatar disappearing
    │  3. DELETE all .scale tracks — prevents scale override
    │  4. RENAME bones to RPM standard names (Pelvis→Hips, L_Thigh→LeftUpLeg, etc.)
    ▼
Cleaned THREE.AnimationClip
    │  Contains tracks like "Hips.quaternion", "Spine.quaternion", etc.
    ▼
mixer.clipAction(clip)
    │  Three.js matches track bone names to GLB avatar skeleton bones
    ▼
AnimationAction.play()
    │  Drives GLB avatar bones every frame via mixer.update(delta)
    ▼
🎭 Avatar dances/waves/walks on screen!
```

---

*This document was created for the AURA Virtual Friend project.*  
*For questions, see the main project docs in `/docs/` or open the browser console (F12) for debug logs.*
