package com.deepholdings.terminal;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

/**
 * `network_security_config.xml` permits cleartext sockets for debug builds,
 * but that is an OS-level policy and does not reach here: the page loads from
 * https://localhost (capacitor.config's androidScheme), so the WebView's own
 * mixed-content check blocks a JS fetch to the LAN dev server's http:// origin
 * before the socket is ever opened. Debug only, same reasoning as that file.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (BuildConfig.DEBUG) {
            getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }
}
