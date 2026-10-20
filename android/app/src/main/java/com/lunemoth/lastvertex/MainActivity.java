package com.lunemoth.lastvertex;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // draw under the bars from the very first frame, so hiding or showing them (launch, ads, swipe) never resizes the game
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);
        hideSystemBars();
        // a bar that comes back on its own (after an ad, a dialog, a swipe) is hidden again right away
        getWindow().getDecorView().setOnApplyWindowInsetsListener((v, insets) -> {
            WindowInsetsCompat compat = WindowInsetsCompat.toWindowInsetsCompat(insets, v);
            if (compat.isVisible(WindowInsetsCompat.Type.statusBars()) || compat.isVisible(WindowInsetsCompat.Type.navigationBars())) {
                v.postDelayed(this::hideSystemBars, 1500);
            }
            return v.onApplyWindowInsets(insets);
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemBars();
    }

    // full screen game: status and navigation bars hidden, a swipe from the edge shows them for a moment
    private void hideSystemBars() {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }
}
