package app.souvenirtravel;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

// جسر الاعتماد الأصيل لغلاف Android — نظير جسر iOS في العقد لا في الحرف:
// «استعادة صامتة عند الإقلاع، ودخول تفاعلي عند الطلب، واعتماد Google
// يُسلَّم لطبقة الويب المشتركة فتمضي به مصالحتها المعتادة».
@CapacitorPlugin(name = "SouvenirAuth")
public class SouvenirAuthPlugin extends Plugin {
    private GoogleSignInClient client;

    private String webClientId() {
        return getContext().getString(R.string.souvenir_web_client_id);
    }

    private boolean unconfigured() {
        return webClientId().startsWith("MISSING");
    }

    private GoogleSignInClient client() {
        if (client == null) {
            GoogleSignInOptions opts =
                new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestIdToken(webClientId())
                    .requestEmail()
                    .build();
            client = GoogleSignIn.getClient(getActivity(), opts);
        }
        return client;
    }

    /** استعادة صامتة عند كل إقلاع — تحلّ وعد الغلاف باعتمادٍ أو بلا شيء. */
    @PluginMethod
    public void restore(PluginCall call) {
        if (unconfigured()) { call.resolve(payload(null)); return; }
        client().silentSignIn().addOnCompleteListener(task -> {
            try { call.resolve(payload(task.getResult(ApiException.class))); }
            catch (ApiException e) { call.resolve(payload(null)); }
        });
    }

    /** دخول تفاعلي بطلبٍ من طبقة الويب (زر تسجيل الدخول في الغلاف). */
    @PluginMethod
    public void signIn(PluginCall call) {
        if (unconfigured()) {
            call.reject("souvenir_web_client_id not configured");
            return;
        }
        startActivityForResult(call, client().getSignInIntent(), "onSignInResult");
    }

    @ActivityCallback
    private void onSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Task<GoogleSignInAccount> task =
            GoogleSignIn.getSignedInAccountFromIntent(result.getData());
        try { call.resolve(payload(task.getResult(ApiException.class))); }
        catch (ApiException e) { call.reject("sign-in failed: " + e.getStatusCode()); }
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        if (unconfigured()) { call.resolve(); return; }
        client().signOut().addOnCompleteListener(t -> call.resolve());
    }

    private JSObject payload(GoogleSignInAccount a) {
        JSObject o = new JSObject();
        o.put("idToken", a == null ? null : a.getIdToken());
        return o;
    }
}
