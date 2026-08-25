package com.appryvo.ryvo;

import android.content.Context;
import android.media.AudioManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Routes in-call audio between the earpiece and the loudspeaker via AudioManager.
 * getUserMedia/WebRTC has no web API for this on Android WebView -- it is strictly a native
 * AudioManager concern (MODE_IN_COMMUNICATION + setSpeakerphoneOn), so it needs this small plugin
 * rather than a JS-only implementation.
 */
@CapacitorPlugin(name = "CallAudio")
public class CallAudioPlugin extends Plugin {

    private AudioManager audioManager() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod
    public void setSpeakerOn(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        AudioManager am = audioManager();
        am.setMode(AudioManager.MODE_IN_COMMUNICATION);
        am.setSpeakerphoneOn(enabled);
        JSObject ret = new JSObject();
        ret.put("enabled", am.isSpeakerphoneOn());
        call.resolve(ret);
    }

    @PluginMethod
    public void getSpeakerOn(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", audioManager().isSpeakerphoneOn());
        call.resolve(ret);
    }

    @PluginMethod
    public void resetAudioMode(PluginCall call) {
        AudioManager am = audioManager();
        am.setSpeakerphoneOn(false);
        am.setMode(AudioManager.MODE_NORMAL);
        call.resolve();
    }
}
