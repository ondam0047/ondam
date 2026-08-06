import kr.dogfoot.hwplib.object.HWPFile;
import kr.dogfoot.hwplib.reader.HWPReader;
import kr.dogfoot.hwpxlib.object.HWPXFile;
import kr.dogfoot.hwpxlib.writer.HWPXWriter;
import kr.dogfoot.hwp2hwpx.Hwp2Hwpx;

public class Convert {
  public static void main(String[] args) throws Exception {
    // 서브커맨드: "fill" = .hwp 셀 채우기(Section0 생성용, record-hwp.ts 가 호출).
    // 인자 없이 <in> <out> 이면 기존 hwp→hwpx 변환(하위호환).
    if (args.length > 0 && args[0].equals("fill")) {
      Fill.main(java.util.Arrays.copyOfRange(args, 1, args.length));
      return;
    }
    if (args.length < 2) { System.err.println("usage: Convert <in.hwp> <out.hwpx> | Convert fill <in.hwp> <edits.json> <out.hwp>"); System.exit(2); }
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
