import kr.dogfoot.hwplib.object.HWPFile;
import kr.dogfoot.hwplib.reader.HWPReader;
import kr.dogfoot.hwpxlib.object.HWPXFile;
import kr.dogfoot.hwpxlib.writer.HWPXWriter;
import kr.dogfoot.hwp2hwpx.Hwp2Hwpx;

public class Convert {
  public static void main(String[] args) {
    if (args.length < 2) { System.err.println("usage: Convert <in.hwp> <out.hwpx>"); System.exit(2); }
    try {
      HWPFile from = HWPReader.fromFile(args[0]);
      HWPXFile to = Hwp2Hwpx.toHWPX(from);
      HWPXWriter.toFilepath(to, args[1]);
      System.out.println("CONVERT_OK");
    } catch (Throwable e) {
      System.err.println("CONVERT_FAIL: " + e.getClass().getSimpleName() + ": " + e.getMessage());
      System.exit(1);
    }
  }
}
