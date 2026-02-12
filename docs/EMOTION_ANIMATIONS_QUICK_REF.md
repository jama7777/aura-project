# Emotion Animation Quick Reference

## Emotion → Animation Mapping

| Emotion | High (≥0.7) | Medium (0.4-0.7) | Low (<0.4) |
|---------|-------------|------------------|------------|
| **happy** | dance, jump, clap | happy, clap | happy |
| **joy** | dance, jump, clap | happy, clap | happy |
| **excited** | jump, dance, clap | jump, happy | happy |
| **sad** | sad | sad | sad |
| **angry** | angry, hug | angry | angry |
| **surprised** | jump | happy | happy |
| **shocked** | jump | happy | happy |
| **amazed** | jump, clap | clap | happy |
| **fear** | sad | sad | sad |
| **scared** | sad | sad | sad |
| **worried** | sad | sad | sad |
| **love** | hug, happy | hug | happy |
| **grateful** | pray, hug | pray | happy |
| **confused** | idle | idle | idle |
| **thinking** | idle | idle | idle |
| **neutral** | idle | idle | idle |

## Animation Flow

```
User Input (Camera/Text/Gesture)
    ↓
Emotion Detection
    ↓
Intensity Calculation (0.0-1.0)
    ↓
Avatar.transitionToEmotion(emotion, duration, true)
    ↓
┌─────────────────┬────────────────────┐
│   Facial        │   Body Animation   │
│  Expression     │   (from map above) │
│  (immediate)    │   (queued if busy) │
└─────────────────┴────────────────────┘
    ↓
If Speech Starts:
  - Clear animation queue
  - Lip sync takes priority
    ↓
Animation Complete → Return to Idle
```

## Testing Checklist

### 1. Facial Emotions
- [ ] Happy: Big smile, squinted eyes
- [ ] Sad: Frown, inner brows up
- [ ] Angry: Furrowed brows, tight lips
- [ ] Surprised: Wide eyes, open mouth
- [ ] Fear: Wide eyes, tense mouth

### 2. Body Animations (High Intensity)
- [ ] Happy → Dance/Jump/Clap
- [ ] Sad → Sad posture
- [ ] Surprised → Jump
- [ ] Love → Hug gesture
- [ ] Grateful → Prayer gesture

### 3. Integration Tests
- [ ] Emotion from camera triggers animation
- [ ] Text emotion triggers animation
- [ ] AURA response emotion triggers animation
- [ ] Speech clears animation queue
- [ ] Multiple emotions queue properly
- [ ] Return to idle after animation

### 4. Edge Cases
- [ ] Missing animation → graceful fallback
- [ ] Rapid emotion changes → queue works
- [ ] Talking during emotion → queue clears
- [ ] Unknown emotion → defaults to neutral

## Debug Commands (Browser Console)

```javascript
// Test specific emotion with intensity
avatar.showEmotion("happy", 0.9, true);

// Test transition
avatar.transitionToEmotion("surprised", 500, true);

// Clear queue
avatar.clearEmotionQueue();

// Check current state
console.log('Current emotion:', avatar.currentEmotion);
console.log('Queue length:', avatar.emotionAnimationQueue.length);
console.log('Is playing:', avatar.isPlayingEmotionAnimation);

// Test animation directly
avatar.playEmotionAnimation("excited", 0.8);
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| No body animation | Check if animation exists: `console.log(avatar.animations)` |
| Animation stuck | Clear queue: `avatar.clearEmotionQueue()` |
| Wrong animation | Check emotion mapping in `getAnimationForEmotion()` |
| Facial only | Check `triggerAnimation` parameter is `true` |
| Queue not clearing | Enable talking: `avatar.setTalking(true)` triggers clear |

## Performance Tips

1. **Intensity matters**: Use lower intensity for subtle reactions
2. **Queue management**: Clear queue before important animations
3. **Facial-only mode**: Set `triggerAnimation=false` for quick reactions
4. **Animation variety**: Random selection adds naturalness

---
Quick Ref v1.0 - Feb 2026
