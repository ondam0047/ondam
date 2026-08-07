import kr.dogfoot.hwplib.object.HWPFile;
import kr.dogfoot.hwplib.reader.HWPReader;
import kr.dogfoot.hwplib.writer.HWPWriter;
import kr.dogfoot.hwplib.object.bodytext.Section;
import kr.dogfoot.hwplib.object.bodytext.ParagraphListInterface;
import kr.dogfoot.hwplib.object.bodytext.paragraph.Paragraph;
import kr.dogfoot.hwplib.object.bodytext.control.Control;
import kr.dogfoot.hwplib.object.bodytext.control.ControlType;
import kr.dogfoot.hwplib.object.bodytext.control.ControlTable;
import kr.dogfoot.hwplib.object.bodytext.control.ControlHeader;
import kr.dogfoot.hwplib.object.bodytext.control.ControlFooter;
import kr.dogfoot.hwplib.object.bodytext.control.table.Row;
import kr.dogfoot.hwplib.object.bodytext.control.table.Cell;
import kr.dogfoot.hwplib.object.bodytext.paragraph.charshape.CharPositionShapeIdPair;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * .hwp 셀 텍스트 치환 PoC.
 * usage: Fill <in.hwp> <edits.json> <out.hwp> [--keep-lineseg]
 * edits.json: [{"table":0,"row":1,"col":2,"p":0,"value":"새 값"}]
 * 좌표 의미는 lib/record-fill.ts 의 Coord 와 동일(문서순 표 index, cellAddr row/col, 셀 내 단락 index).
 */
public class Fill {
  static List<ControlTable> tables = new ArrayList<>();
  static boolean clearLineSeg = true;

  public static void main(String[] args) throws Exception {
    if (args.length < 3) { System.err.println("usage: Fill <in.hwp> <edits.json> <out.hwp> [--keep-lineseg]"); System.exit(2); }
    for (String a : args) if (a.equals("--keep-lineseg")) clearLineSeg = false;

    HWPFile f = HWPReader.fromFile(args[0]);
    for (Section s : f.getBodyText().getSectionList()) collect(s);

    String json = new String(Files.readAllBytes(Paths.get(args[1])), StandardCharsets.UTF_8);
    List<Map<String, Object>> edits = Json.parseArray(json);

    int ok = 0, miss = 0;
    for (Map<String, Object> e : edits) {
      String value = String.valueOf(e.get("value"));
      String res;
      if (e.containsKey("titleLabel")) {
        // 표 밖 제목 단락의 "라벨 ( N월 )" 채우기 — value = 월 숫자
        res = applyTitle(f, String.valueOf(e.get("titleLabel")), value);
        System.out.println("  [title] " + res);
      } else {
        int ti = num(e.get("table")), r = num(e.get("row")), c = num(e.get("col"));
        int pi = e.containsKey("p") ? num(e.get("p")) : 0;
        boolean clearRest = "true".equals(String.valueOf(e.get("clearRest")));
        res = apply(ti, r, c, pi, value, clearRest);
        System.out.println("  [" + ti + "," + r + "," + c + "," + pi + "] " + res);
      }
      if (res.startsWith("OK")) ok++; else miss++;
    }
    HWPWriter.toFile(f, args[2]);
    System.out.println("FILL_DONE ok=" + ok + " miss=" + miss + " lineSeg=" + (clearLineSeg ? "cleared" : "kept") + " -> " + args[2]);
  }

  static void collect(ParagraphListInterface pl) {
    for (int i = 0; i < pl.getParagraphCount(); i++) {
      Paragraph p = pl.getParagraph(i);
      if (p.getControlList() == null) continue;
      for (Control c : p.getControlList()) {
        if (c.getType() == ControlType.Table) collectTable((ControlTable) c);
        else if (c.getType() == ControlType.Header) collect(((ControlHeader) c).getParagraphList());
        else if (c.getType() == ControlType.Footer) collect(((ControlFooter) c).getParagraphList());
      }
    }
  }

  static void collectTable(ControlTable t) {
    tables.add(t);
    List<ControlTable> nested = new ArrayList<>();
    for (Row r : t.getRowList())
      for (Cell cell : r.getCellList())
        for (int pi = 0; pi < cell.getParagraphList().getParagraphCount(); pi++) {
          Paragraph cp = cell.getParagraphList().getParagraph(pi);
          if (cp.getControlList() == null) continue;
          for (Control cc : cp.getControlList())
            if (cc.getType() == ControlType.Table) nested.add((ControlTable) cc);
        }
    for (ControlTable n : nested) collectTable(n);
  }

  static String apply(int ti, int row, int col, int pi, String value) throws Exception {
    return apply(ti, row, col, pi, value, false);
  }

  // clearRest: 대상 문단만 남기고 나머지 문단 제거 — 센터가 값칸에 미리 적어둔
  // 여러 문단 옛 값이 출력에 남지 않게(hwpx 경로의 clearRest 와 동일 의도).
  static String apply(int ti, int row, int col, int pi, String value, boolean clearRest) throws Exception {
    if (ti < 0 || ti >= tables.size()) return "MISS: 표 없음(총 " + tables.size() + ")";
    ControlTable t = tables.get(ti);
    Cell target = null;
    for (Row r : t.getRowList())
      for (Cell cell : r.getCellList())
        if (cell.getListHeader().getRowIndex() == row && cell.getListHeader().getColIndex() == col) target = cell;
    if (target == null) return "MISS: 셀 없음";
    if (pi >= target.getParagraphList().getParagraphCount()) return "MISS: 단락 없음(총 " + target.getParagraphList().getParagraphCount() + ")";
    Paragraph p = target.getParagraphList().getParagraph(pi);

    String before = p.getText() == null ? "" : p.getText().getNormalString(0);

    // 빈 값을 이미 빈 칸에 쓰는 건 no-op — 텍스트를 비운 채 charShape 만 남기면
    // hwplib writer 가 표 직렬화에서 IndexOutOfBounds 로 죽는다(빈 charList 미지원).
    if (value.isEmpty() && before.isEmpty()) return "OK: 이미 빈 칸(스킵)";

    // 글자 속성 보존: 기존 첫 run 의 charShapeId 를 그대로 새 텍스트 전체에 적용
    int keepShape = -1;
    if (p.getCharShape() != null && !p.getCharShape().getPositonShapeIdPairList().isEmpty())
      keepShape = (int) p.getCharShape().getPositonShapeIdPairList().get(0).getShapeId();

    if (value.isEmpty()) {
      // 빈 값으로 지우기 — charList 를 비운 채 두면 hwplib writer 가 표 직렬화에서 죽는다.
      // 텍스트 객체 자체를 제거해 '텍스트 없는 단락'(템플릿 빈칸과 동일 형태)으로 만든다.
      p.deleteText();
    } else {
      if (p.getText() == null) p.createText();
      p.getText().getCharList().clear();
      p.getText().addString(value);
    }

    if (p.getCharShape() == null) p.createCharShape();
    p.getCharShape().getPositonShapeIdPairList().clear();
    p.getCharShape().addParaCharShape(0L, keepShape >= 0 ? keepShape : 0L);

    // 줄 위치 캐시 제거 → 한글이 새로 계산 (hwpx 파이프라인의 linesegarray 삭제와 동일 의도)
    if (clearLineSeg && p.getLineSeg() != null) p.getLineSeg().getLineSegItemList().clear();

    // clearRest — 대상(pi) 외 문단 제거. 뒤에서 앞으로 지워 인덱스 보존.
    if (clearRest && target.getParagraphList().getParagraphCount() > 1) {
      for (int k = target.getParagraphList().getParagraphCount() - 1; k >= 0; k--) {
        if (k != pi) target.getParagraphList().deleteParagraph(k);
      }
    }

    return "OK: \"" + before.replace("\n", "\\n") + "\" -> \"" + value.replace("\n", "\\n") + "\" (charShape=" + keepShape + ")";
  }

  // 섹션 최상위 단락에서 "라벨 … ( N월 )" 제목을 찾아 월 숫자를 삽입/교체.
  // 제목 단락은 보통 섹션 첫 단락이라 구역정의(secd)·단정의(cold) 컨트롤 문자가 앞에 있다
  // — 통째 재작성하면 앵커가 날아가므로, 숫자 자리만 외과적으로 삽입/교체한다.
  // charShape run 위치는 워드 단위(확장 컨트롤=8워드)라 삽입 지점 이후 run 만 delta 보정.
  static String applyTitle(HWPFile f, String label, String monthStr) throws Exception {
    java.util.regex.Pattern pat =
        java.util.regex.Pattern.compile(label + "\\s*[(\uFF08]\\s*(\\d*)(?=\\s*\uC6D4)");
    for (Section s : f.getBodyText().getSectionList()) {
      for (int i = 0; i < s.getParagraphCount(); i++) {
        Paragraph p = s.getParagraph(i);
        if (p.getText() == null) continue;
        String txt = p.getText().getNormalString(0);
        java.util.regex.Matcher m = pat.matcher(txt);
        if (!m.find()) continue;
        int numEndN = m.end(), numStartN = m.end() - m.group(1).length();

        // normal 문자 인덱스 → charList 인덱스·워드 위치 환산(컨트롤 문자 보존)
        java.util.List<kr.dogfoot.hwplib.object.bodytext.paragraph.text.HWPChar> chars =
            p.getText().getCharList();
        int listStart = -1, listEnd = -1, n = 0;
        long wordPos = 0, insertWord = -1;
        for (int k = 0; k < chars.size(); k++) {
          kr.dogfoot.hwplib.object.bodytext.paragraph.text.HWPChar ch = chars.get(k);
          boolean normal = ch.getType()
              == kr.dogfoot.hwplib.object.bodytext.paragraph.text.HWPCharType.Normal;
          if (normal) {
            if (n == numStartN && listStart < 0) { listStart = k; insertWord = wordPos; }
            if (n == numEndN) { listEnd = k; break; }
            n++;
          }
          wordPos += (ch.getType()
                  == kr.dogfoot.hwplib.object.bodytext.paragraph.text.HWPCharType.ControlInline
              || ch.getType()
                  == kr.dogfoot.hwplib.object.bodytext.paragraph.text.HWPCharType.ControlExtend)
              ? 8 : 1;
        }
        if (listStart < 0) return "MISS: 제목 숫자 위치 환산 실패";
        if (listEnd < 0) listEnd = listStart;

        int removed = listEnd - listStart;
        for (int k = listEnd - 1; k >= listStart; k--) chars.remove(k);
        for (int d = 0; d < monthStr.length(); d++) {
          kr.dogfoot.hwplib.object.bodytext.paragraph.text.HWPCharNormal c =
              new kr.dogfoot.hwplib.object.bodytext.paragraph.text.HWPCharNormal();
          c.setCode((short) monthStr.charAt(d));
          chars.add(listStart + d, c);
        }
        long delta = monthStr.length() - removed;
        if (delta != 0 && p.getCharShape() != null)
          for (CharPositionShapeIdPair pair : p.getCharShape().getPositonShapeIdPairList())
            if (pair.getPosition() > insertWord)
              pair.setPosition(Math.max(0, pair.getPosition() + delta));
        if (clearLineSeg && p.getLineSeg() != null) p.getLineSeg().getLineSegItemList().clear();
        return "OK: \"" + txt + "\" + \uC6D4=" + monthStr;
      }
    }
    return "MISS: 제목 단락 못 찾음";
  }

  static int num(Object o) { return (int) Double.parseDouble(String.valueOf(o)); }

  /** 최소 JSON 파서 — [ {"k": "v"|숫자, ...}, ... ] 만 지원 */
  static class Json {
    String s; int i;
    Json(String s) { this.s = s; }
    static List<Map<String, Object>> parseArray(String s) {
      Json j = new Json(s); j.ws();
      List<Map<String, Object>> out = new ArrayList<>();
      j.expect('['); j.ws();
      if (j.peek() == ']') { j.i++; return out; }
      while (true) {
        out.add(j.obj()); j.ws();
        if (j.peek() == ',') { j.i++; j.ws(); continue; }
        j.expect(']'); break;
      }
      return out;
    }
    Map<String, Object> obj() {
      Map<String, Object> m = new HashMap<>();
      expect('{'); ws();
      if (peek() == '}') { i++; return m; }
      while (true) {
        String k = str(); ws(); expect(':'); ws();
        m.put(k, peek() == '"' ? str() : numTok());
        ws();
        if (peek() == ',') { i++; ws(); continue; }
        expect('}'); break;
      }
      return m;
    }
    String str() {
      expect('"');
      StringBuilder b = new StringBuilder();
      while (true) {
        char c = s.charAt(i++);
        if (c == '"') break;
        if (c == '\\') {
          char e = s.charAt(i++);
          switch (e) {
            case 'n': b.append('\n'); break;
            case 't': b.append('\t'); break;
            case 'r': break;
            case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
            default: b.append(e);
          }
        } else b.append(c);
      }
      return b.toString();
    }
    String numTok() {
      // 숫자 + true/false/null 리터럴 — clearRest 같은 boolean 필드 지원
      int st = i;
      while (i < s.length() && "-+.eEtruefalsn0123456789".indexOf(s.charAt(i)) >= 0) i++;
      return s.substring(st, i);
    }
    void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
    char peek() { return s.charAt(i); }
    void expect(char c) { if (s.charAt(i) != c) throw new RuntimeException("JSON expect '" + c + "' at " + i + " got '" + s.charAt(i) + "'"); i++; }
  }
}
