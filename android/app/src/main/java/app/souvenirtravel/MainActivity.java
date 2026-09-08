package app.souvenirtravel;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SouvenirAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
