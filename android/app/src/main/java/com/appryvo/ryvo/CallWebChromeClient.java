package com.appryvo.ryvo;

import android.net.Uri;
import android.webkit.PermissionRequest;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Restricts WebRTC capture to Ryvo's Capacitor origin and known media resources. */
final class CallWebChromeClient extends BridgeWebChromeClient {
    private static final Set<String> MEDIA_RESOURCES = new HashSet<>(Arrays.asList(
        PermissionRequest.RESOURCE_AUDIO_CAPTURE,
        PermissionRequest.RESOURCE_VIDEO_CAPTURE
    ));

    private final Bridge bridge;

    CallWebChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        bridge.getActivity().runOnUiThread(() -> {
            String[] resources = request.getResources();
            if (!isAllowedOrigin(request.getOrigin()) || resources.length == 0) {
                request.deny();
                return;
            }
            for (String resource : resources) {
                if (!MEDIA_RESOURCES.contains(resource)) {
                    request.deny();
                    return;
                }
            }

            // BridgeWebChromeClient performs the CAMERA/RECORD_AUDIO runtime checks and only
            // grants after ActivityResultContracts reports that every required permission was
            // approved. It also keeps voice calls microphone-only because VIDEO_CAPTURE is not
            // requested by getUserMedia({ video: false }).
            super.onPermissionRequest(request);
        });
    }

    private boolean isAllowedOrigin(Uri origin) {
        if (origin == null) return false;
        Uri allowed = bridge.getServerUrl() == null
            ? Uri.parse(bridge.getScheme() + "://" + bridge.getHost())
            : Uri.parse(bridge.getServerUrl());
        return equalsIgnoreCase(origin.getScheme(), allowed.getScheme())
            && equalsIgnoreCase(origin.getHost(), allowed.getHost())
            && effectivePort(origin) == effectivePort(allowed);
    }

    private static boolean equalsIgnoreCase(String left, String right) {
        return left != null && right != null && left.equalsIgnoreCase(right);
    }

    private static int effectivePort(Uri uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "http".equalsIgnoreCase(uri.getScheme()) ? 80
            : "https".equalsIgnoreCase(uri.getScheme()) ? 443 : -1;
    }
}
