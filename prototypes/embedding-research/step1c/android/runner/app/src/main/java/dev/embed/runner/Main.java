package dev.embed.runner;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.os.Bundle;
import android.util.Half;
import android.util.Log;
import java.io.*;
import java.nio.*;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.List;
import org.tensorflow.lite.Interpreter;

// Extras: model (file in files dir), input (f32 / f16 tensor file, or a text file of JPEG names when fmt=jpg),
// fmt (f32|f16|jpg), out (output file name), threads. Writes raw float32 [N,512] to out and timings to out+".ms".
public class Main extends Activity {
    static final String TAG = "embedrunner";
    static final int S = 384, D = 512;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Bundle e = getIntent().getExtras();
        File dir = getExternalFilesDir(null);
        new Thread(() -> {
            String out = e.getString("out");
            try {
                run(dir, e.getString("model"), e.getString("input"), e.getString("fmt"), out, e.getInt("threads", 4));
            } catch (Throwable t) {
                Log.e(TAG, "failed", t);
                try (PrintWriter w = new PrintWriter(new File(dir, out + ".err"))) { t.printStackTrace(w); } catch (IOException ignored) {}
            }
            finish();
        }).start();
    }

    static void run(File dir, String model, String input, String fmt, String out, int threads) throws IOException {
        FileChannel fc = new FileInputStream(new File(dir, model)).getChannel();
        MappedByteBuffer mb = fc.map(FileChannel.MapMode.READ_ONLY, 0, fc.size());
        Interpreter.Options o = new Interpreter.Options().setNumThreads(threads);
        Interpreter it = new Interpreter(mb, o);
        int n = 3 * S * S;
        ByteBuffer in = ByteBuffer.allocateDirect(n * 4).order(ByteOrder.nativeOrder());
        ByteBuffer res = ByteBuffer.allocateDirect(D * 4).order(ByteOrder.nativeOrder());
        List<String> jpgs = new ArrayList<>();
        RandomAccessFile raf = null;
        int count;
        if (fmt.equals("jpg")) {
            try (BufferedReader r = new BufferedReader(new FileReader(new File(dir, input)))) {
                String l; while ((l = r.readLine()) != null) if (!l.isEmpty()) jpgs.add(l);
            }
            count = jpgs.size();
        } else {
            raf = new RandomAccessFile(new File(dir, input), "r");
            count = (int) (raf.length() / ((long) n * (fmt.equals("f16") ? 2 : 4)));
        }
        byte[] raw = new byte[n * (fmt.equals("f16") ? 2 : 4)];
        DataOutputStream os = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(new File(dir, out + ".tmp"))));
        PrintWriter ms = new PrintWriter(new File(dir, out + ".ms"));
        Log.i(TAG, "model " + model + " inputs " + count + " in " + java.util.Arrays.toString(it.getInputTensor(0).shape()));
        for (int k = 0; k < count; k++) {
            in.clear();
            FloatBuffer fb = in.asFloatBuffer();
            if (fmt.equals("jpg")) {
                fillFromJpeg(new File(dir, jpgs.get(k)), fb);
            } else {
                raf.readFully(raw);
                ByteBuffer rb = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN);
                if (fmt.equals("f16")) { for (int i = 0; i < n; i++) fb.put(Half.toFloat(rb.getShort())); }
                else { fb.put(rb.asFloatBuffer()); }
            }
            in.rewind(); res.clear();
            long t0 = System.nanoTime();
            it.run(in, res);
            long t1 = System.nanoTime();
            ms.println((t1 - t0) / 1e6);
            res.rewind();
            ByteBuffer le = ByteBuffer.allocate(D * 4).order(ByteOrder.LITTLE_ENDIAN);
            for (int i = 0; i < D; i++) le.putFloat(res.getFloat());
            os.write(le.array());
        }
        os.close(); ms.close(); it.close();
        new File(dir, out + ".tmp").renameTo(new File(dir, out));
        Log.i(TAG, "done " + out);
    }

    // Decode, scale to 384 high keeping aspect (bilinear), centre on a mean-colour (127) background, NCHW in [0,1].
    static void fillFromJpeg(File f, FloatBuffer fb) {
        Bitmap src = BitmapFactory.decodeFile(f.getPath());
        float s = Math.min((float) S / src.getWidth(), (float) S / src.getHeight());
        int nw = Math.max(1, Math.round(src.getWidth() * s)), nh = Math.max(1, Math.round(src.getHeight() * s));
        Bitmap sc = Bitmap.createScaledBitmap(src, nw, nh, true);
        Bitmap bg = Bitmap.createBitmap(S, S, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bg);
        c.drawColor(Color.rgb(127, 127, 127));
        c.drawBitmap(sc, (S - nw) / 2, (S - nh) / 2, null);
        int[] px = new int[S * S];
        bg.getPixels(px, 0, S, 0, 0, S, S);
        for (int ch = 0; ch < 3; ch++) {
            int sh = 16 - 8 * ch;
            for (int i = 0; i < S * S; i++) fb.put(((px[i] >> sh) & 0xff) / 255f);
        }
        src.recycle(); sc.recycle(); bg.recycle();
    }
}
