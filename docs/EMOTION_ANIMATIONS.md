# Avatar Emotion Animations - Feature Documentation

## Overview
The AURA avatar now features comprehensive emotion-based animations that combine facial expressions with full-body gestures, creating natural and expressive interactions.

## How It Works

### 1. Emotion Detection
Emotions are detected from multiple sources:
- **User's face** via camera (using Face-API.js)
- **User's text** via keyword analysis
- **AURA's response** via LLM emotion tagging

### 2. Facial Expression System
The avatar's face responds immediately with appropriate blendshape adjustments:
- **Happy**: Big smile, squinted eyes, raised cheeks
- **Sad**: Droopy eyes, inner brows up, frown
- **Angry**: Furrowed brows, tight lips, intense squint
- **Surprised**: Wide eyes, raised brows, open mouth
- **Fear**: Wide eyes, raised inner brows, tense mouth
- **Disgust**: Wrinkled nose, raised upper lip
- And more...

### 3. Body Animation System (NEW!)
The avatar now performs full-body animations based on emotion **intensity**:

#### Emotion-to-Animation Mapping

**Happy/Joy/Excited**
- High intensity (≥0.7): Dance, jump, or clap
- Medium intensity (0.4-0.7): Happy gesture or clap
- Low intensity (<0.4): Subtle happy gesture

**Sad/Depressed/Upset**
- All intensities: Sad posture (slumped shoulders, head down)

**Angry/Frustrated**
- High intensity: Tense angry stance
- Medium/Low: Moderate angry posture

**Surprised/Shocked/Amazed**
- High intensity: Jump in surprise
- Medium: Clapping or happy gesture
- Low: Subtle reaction

**Fear/Scared/Worried**
- All intensities: Defensive/cowering pose

**Love/Grateful**
- High intensity: Hug gesture + prayer/thankful pose
- Medium: Hug or prayer
- Low: Gentle happy gesture

**Confused/Thinking**
- All intensities: Minimal movement (thoughtful idle)

### 4. Animation Queue System
Prevents animation conflicts:
- If an emotion animation is already playing, new emotions are **queued**
- Animations play sequentially with smooth transitions
- Queue is **cleared** when avatar starts talking (lip sync takes priority)

### 5. Coordination with Speech
When AURA responds:
1. **Facial expression** transitions to response emotion (400ms smooth transition)
2. **Body animation** triggers based on emotion intensity
3. If audio playback starts:
   - Animation queue is cleared
   - Lip sync takes priority
   - Body animation may continue in background if compatible

## Usage Examples

### Example 1: User shows happiness
```javascript
// User's camera detects happy emotion (confidence: 0.85)
currentEmotion = "happy";
// Triggers:
// - Facial: Big smile, squinted eyes
// - Body: Dance animation (high intensity)
```

### Example 2: AURA responds with gratitude
```javascript
// LLM returns: "Thank you so much! [[grateful]]"
responseEmotion = "grateful";
intensity = 1.0;
// Triggers:
// - Facial: Soft smile, warm expression
// - Body: Prayer gesture + hug animation
// - Then: Plays audio with lip sync
```

### Example 3: Mixed interaction
```javascript
// User types: "I'm so sad today"
userEmotion = "sad";
// User's emotion shown on avatar:
// - Facial only (intensity 0.5, no body animation)

// AURA responds: "I'm sorry to hear that. [[sad]]"
// AURA's emotion:
// - Facial: Empathetic sad expression
// - Body: Sad posture animation
// - Audio: Lip sync with emotion overlay
```

## Key Functions

### Avatar.js Methods

#### `showEmotion(emotion, intensity, triggerAnimation)`
Shows emotion on face, optionally triggers body animation
```javascript
avatar.showEmotion("happy", 0.8, true);
// intensity: 0.0-1.0
// triggerAnimation: true/false (default: true)
```

#### `transitionToEmotion(targetEmotion, duration, triggerAnimation)`
Smoothly transitions to new emotion
```javascript
avatar.transitionToEmotion("surprised", 500, true);
// duration: transition time in ms
// triggerAnimation: trigger body animation after transition
```

#### `playEmotionAnimation(emotion, intensity)`
Directly play emotion-based body animation
```javascript
avatar.playEmotionAnimation("excited", 0.9);
```

#### `clearEmotionQueue()`
Clear queued emotion animations
```javascript
avatar.clearEmotionQueue();
```

## Technical Details

### Animation Selection Algorithm
1. Normalize emotion name to lowercase
2. Determine intensity level:
   - High: ≥0.7
   - Medium: 0.4-0.6
   - Low: <0.4
3. Look up animation options for emotion + intensity
4. Randomly select from available options (adds variety)
5. Play animation once (loopOnce=true)
6. Return to idle when complete (if not talking)

### Animation Completion Detection
- Uses `AnimationAction.isRunning()` to detect completion
- Polls via `requestAnimationFrame` for smooth checking
- Handles edge cases (missing animations, queue management)

### Priority System
1. **Lip Sync** (highest priority)
   - Clears emotion queue
   - Runs uninterrupted
2. **Emotion Animations**
   - Queue if one is already playing
   - Can be interrupted by speech
3. **Idle Animation** (lowest priority)
   - Returns automatically when nothing else is happening

## Configuration

### Available Base Animations
The system assumes these animations exist in the loaded model:
- `idle` - Default neutral state
- `happy` - Happy gesture
- `sad` - Sad posture
- `angry` - Angry stance (if available)
- `dance` - Dance movement
- `jump` - Jump action
- `clap` - Clapping
- `hug` - Hug gesture
- `pray` - Prayer/thankful gesture

### Customization
To add new emotion mappings, edit `getAnimationForEmotion()` in `avatar.js`:

```javascript
const emotionAnimationMap = {
    'your_emotion': {
        high: ['animation1', 'animation2'],
        medium: ['animation3'],
        low: ['animation4']
    }
};
```

## Performance Considerations

- **Facial expressions**: Real-time (60 FPS via morph targets)
- **Body animations**: Smooth (skeletal animation via Three.js mixer)
- **Queue size**: Automatically managed (only queues, doesn't drop)
- **Memory**: Minimal overhead (reuses existing animation clips)

## Debugging

Enable debug console (visible on page):
- Shows emotion detection
- Shows animation selection
- Shows queue status
- Shows lip sync frame count

Check browser console for:
- Detailed animation selection logs
- Error messages if animations are missing
- Queue processing status

## Future Enhancements

Potential improvements:
1. **Blend multiple emotions** (e.g., "happily surprised")
2. **Emotion transition smoothing** for subtle emotion shifts
3. **Context-aware animation selection** (e.g., different "happy" for different situations)
4. **User-configurable intensity thresholds**
5. **Custom animation upload support**

## Compatibility

- Works with any Ready Player Me avatar (.glb with animations)
- Falls back gracefully if animations are missing
- Compatible with FBX, OBJ models (facial only if no animations)
- Supports both morph target and bone-based facial animation

---

**Last Updated**: 2026-02-09
**Version**: 1.0
**Feature Status**: ✅ Fully Implemented
