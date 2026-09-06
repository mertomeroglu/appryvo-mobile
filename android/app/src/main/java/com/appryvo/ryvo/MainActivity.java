package com.appryvo.ryvo;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Must run before super.onCreate(): captures AppTheme.Launcher's splash attributes and
        // keeps the system splash on screen for the shortest possible moment (just process
        // creation) before the WebView paints the JS bootstrap screen (logo + loader), which
        // uses the same background/logo so the handoff is visually continuous.
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);

        // On API <31 the compat library plays a built-in exit animation/delay before removing
        // its own SplashScreenView -- confirmed on-device as several hundred extra ms of lingering
        // splash. Skip the animation and remove it the instant the library considers it safe to.
        splashScreen.setOnExitAnimationListener(splashScreenView -> splashScreenView.remove());

        // Must be registered before super.onCreate() per Capacitor's plugin registration contract.
        registerPlugin(CallAudioPlugin.class);

        super.onCreate(savedInstanceState);

        // Keep Capacitor's own BridgeWebChromeClient. Replacing it here made camera permission
        // delivery depend on a second, app-maintained origin comparison and could leave
        // getUserMedia unresolved even after Android granted CAMERA permission.
    }
}
