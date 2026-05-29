#!/usr/bin/env python3
"""
바로일지 사용 설명서 PDF 생성기.

세 가지 역할(원장·행정·치료사) 마다 한 파일씩 만들어
public/guides/ 폴더에 저장.

폰트: Noto Sans CJK (한국어), 일반·굵게 두 가지 weight.
스타일: 표지 → 목차 → 본문(번호 단계 카드, 콜아웃 박스, FAQ).
"""

from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
    Table, TableStyle, PageBreak, KeepTogether, Flowable
)

# ─── 폰트 등록 ────────────────────────────────────────────────────────────
FONT_REGULAR = "/usr/share/fonts/truetype/nanum/NanumGothic.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"
pdfmetrics.registerFont(TTFont("Noto", FONT_REGULAR))
pdfmetrics.registerFont(TTFont("Noto-Bold", FONT_BOLD))

# ─── 색상 팔레트 (앱과 동일한 톤) ────────────────────────────────────────
COLOR_PRIMARY      = HexColor("#5B8FCF")
COLOR_PRIMARY_DARK = HexColor("#1F4E91")
COLOR_PRIMARY_SOFT = HexColor("#E8F1FC")
COLOR_TEXT         = HexColor("#2A2F37")
COLOR_TEXT_SOFT    = HexColor("#5D636E")
COLOR_TEXT_MUTE    = HexColor("#9098A4")
COLOR_BORDER       = HexColor("#E1E5EB")
COLOR_SURFACE      = HexColor("#FFFFFF")
COLOR_SURFACE_2    = HexColor("#F6F8FB")
COLOR_DANGER       = HexColor("#C8554E")
COLOR_TIP_BG       = HexColor("#FFF8E1")
COLOR_TIP_BD       = HexColor("#F0CD5A")
COLOR_WARN_BG      = HexColor("#FDECEC")
COLOR_WARN_BD      = HexColor("#E8919A")
COLOR_INFO_BG      = HexColor("#E8F1FC")
COLOR_INFO_BD      = HexColor("#7BAEE5")

ROLE_PALETTE = {
    "OWNER":     {"bg": HexColor("#FFF5E6"), "bd": HexColor("#F5C57E"), "fg": HexColor("#A66400"), "label": "원장"},
    "ADMIN":     {"bg": HexColor("#E8F1FC"), "bd": HexColor("#7BAEE5"), "fg": HexColor("#1F4E91"), "label": "행정"},
    "THERAPIST": {"bg": HexColor("#E7F4EE"), "bd": HexColor("#7CC1A3"), "fg": HexColor("#1F7A52"), "label": "치료사"},
}

# ─── 단락 스타일 ────────────────────────────────────────────────────────
def make_styles():
    return {
        "h1": ParagraphStyle("h1", fontName="Noto-Bold", fontSize=26, leading=32,
                             textColor=COLOR_TEXT, spaceAfter=6, alignment=TA_LEFT),
        "h2": ParagraphStyle("h2", fontName="Noto-Bold", fontSize=18, leading=24,
                             textColor=COLOR_TEXT, spaceBefore=22, spaceAfter=8, alignment=TA_LEFT),
        "h3": ParagraphStyle("h3", fontName="Noto-Bold", fontSize=13.5, leading=18,
                             textColor=COLOR_TEXT, spaceBefore=10, spaceAfter=4),
        "body": ParagraphStyle("body", fontName="Noto", fontSize=11, leading=18,
                               textColor=COLOR_TEXT, alignment=TA_LEFT, spaceAfter=6),
        "small": ParagraphStyle("small", fontName="Noto", fontSize=9.5, leading=14,
                                textColor=COLOR_TEXT_SOFT),
        "mute": ParagraphStyle("mute", fontName="Noto", fontSize=10, leading=14,
                               textColor=COLOR_TEXT_MUTE),
        "step_title": ParagraphStyle("step_title", fontName="Noto-Bold", fontSize=11.5, leading=16,
                                     textColor=COLOR_TEXT, spaceAfter=2),
        "step_body":  ParagraphStyle("step_body", fontName="Noto", fontSize=10.5, leading=16.5,
                                     textColor=COLOR_TEXT_SOFT, spaceAfter=0),
        "callout":    ParagraphStyle("callout", fontName="Noto", fontSize=10.5, leading=16,
                                     textColor=COLOR_TEXT),
        "footer":     ParagraphStyle("footer", fontName="Noto", fontSize=8.5,
                                     textColor=COLOR_TEXT_MUTE, alignment=TA_CENTER),
        "cover_title": ParagraphStyle("cover_title", fontName="Noto-Bold", fontSize=42, leading=50,
                                      textColor=COLOR_PRIMARY_DARK, alignment=TA_CENTER, spaceAfter=10),
        "cover_sub":   ParagraphStyle("cover_sub", fontName="Noto", fontSize=14, leading=22,
                                      textColor=COLOR_TEXT_SOFT, alignment=TA_CENTER, spaceAfter=40),
        "cover_role":  ParagraphStyle("cover_role", fontName="Noto-Bold", fontSize=18,
                                      textColor=COLOR_PRIMARY_DARK, alignment=TA_CENTER, spaceAfter=8),
        "cover_meta":  ParagraphStyle("cover_meta", fontName="Noto", fontSize=10,
                                      textColor=COLOR_TEXT_MUTE, alignment=TA_CENTER),
    }


# ─── 콘텐츠 정의 ─────────────────────────────────────────────────────────
@dataclass
class Step:
    title: str
    body: str

@dataclass
class Callout:
    kind: Literal["tip", "warn", "info"]
    text: str

@dataclass
class FAQ:
    q: str
    a: str

@dataclass
class Section:
    title: str
    intro: str
    steps: list[Step]
    callouts: list[Callout]

INTRO_SECTION = Section(
    title="처음 사용하기",
    intro="바로일지는 발달재활 센터의 <b>일정표·기록지 작성을 자동화</b>하는 통합관리 도구입니다. 한 번 입력한 아동 정보로 매월 반복되는 서류를 빠르게 만들 수 있어요.",
    steps=[
        Step("로그인 · 가입",
             "화면의 안내에 따라 가입하세요. <b>첫 가입자(원장)</b>는 자동으로 원장 권한이 부여되며, 6자리 <b>승인코드</b>가 발급됩니다. 치료사·행정 선생님들은 그 코드를 받아 가입하세요."),
        Step("대시보드 확인",
             "로그인 후 첫 화면이 대시보드입니다. 본인 역할에 맞는 정보(이번 주 일정, 미작성 기록 등)가 한 눈에 보입니다."),
        Step("왼쪽 메뉴 활용",
             "모든 기능은 왼쪽 사이드바에서 접근합니다. 메뉴는 역할에 따라 다르게 보입니다 (예: 행정 선생님은 일정표·기록지 작성 메뉴가 없음). 모바일에서는 좌측 상단 햄버거 메뉴를 누르면 사이드바가 열립니다."),
        Step("내 차단 시간 설정 (치료사·원장)",
             "본인이 받기 어려운 요일·시간대를 미리 등록하세요. 일정표 작성 시 이 시간이 표시되어 다른 사람도 확인할 수 있어요."),
    ],
    callouts=[
        Callout("tip", "처음 가입 시 받은 <b>6자리 승인코드</b>는 잊지 말고 메모해두세요. 치료사·행정 선생님 가입 시 매번 필요합니다. 분실 시 [센터 설정]에서 다시 발급 가능."),
    ],
)

OWNER_SECTION = Section(
    title="원장님 가이드",
    intro="원장님은 모든 기능을 사용할 수 있습니다. 센터 운영 관리 + 본인 회기 작성 둘 다 가능해요. 원장 대시보드는 본인이 담당하는 아동 정보와 센터 전체 운영 현황을 동시에 보여줍니다.",
    steps=[
        Step("센터 설정",
             "[센터 설정] 메뉴에서 센터 이름·주소·전화번호를 입력하고, 승인코드를 관리합니다. 승인코드가 외부에 유출됐다 싶으면 <b>재발급</b> 버튼으로 새 코드를 받을 수 있어요."),
        Step("치료사·행정 계정 승인",
             "치료사가 자가 가입하면 [치료사 관리] 메뉴 상단에 <b>승인 대기</b> 카드가 나타납니다. [승인] 누르면 활성화, [거절] 누르면 가입 취소됩니다."),
        Step("아동 등록",
             "[아동 관리] → [아동 등록]에서 아동 정보를 입력하세요. 생년월일·서비스 종류·기본 회기 시간(예: 16:00~16:50)·기본 요일·회당 단가·월 목표 회기 수까지 한번에 입력하면, 이후 일정표·기록지를 만들 때 자동으로 채워집니다."),
        Step("엑셀로 일괄 가져오기",
             "아동이 많으면 [엑셀 가져오기]로 한 번에 등록 가능합니다. 전자바우처에서 받은 엑셀 그대로 업로드하면 이름·생년월일·관리번호를 자동 인식해요."),
        Step("치료사 시간표 확인",
             "[치료사 시간표]에서 선생님별 한 달 스케줄을 표로 볼 수 있고, 그 화면에서 출석부(엑셀)도 다운로드할 수 있습니다. 개별 치료사의 <b>차단 시간</b>(=받지 않는 시간)이 사선으로 표시됩니다."),
        Step("본인 일정표 · 기록지 작성",
             "본인이 담당하는 아동이 있다면 치료사와 동일하게 [일정표], [기록지]에서 작성할 수 있어요. 일정표 메뉴의 치료사 입력란에는 자동으로 원장님 이름이 채워집니다. 매월 한 번씩 만들고 한글파일(.hwpx)로 다운로드 → 인쇄·제출."),
        Step("센터 전체 통계 모니터링",
             "대시보드 하단의 <b>센터 전체 현황</b> 영역에서 활동 치료사 수, 승인 대기, 미작성 기록지, 치료사별 진행률, 서비스 종류 분포를 한 눈에 확인할 수 있습니다."),
    ],
    callouts=[
        Callout("info", "<b>승인코드 재발급</b>은 이전 코드를 무효화합니다. 재발급 후엔 새 코드로만 가입할 수 있어요."),
        Callout("tip", "원장님 본인이 담당하는 아동만 일정표·기록지·아동 관리 메뉴에 표시됩니다. 다른 치료사의 아동은 보이지 않으니 안심하세요."),
    ],
)

ADMIN_SECTION = Section(
    title="행정 선생님 가이드",
    intro="행정 선생님은 센터 운영·관리 기능에 집중합니다. 일정표·기록지 작성은 직접 하지 않지만, 모든 치료사의 일정과 기록을 볼 수 있어요.",
    steps=[
        Step("대시보드",
             "센터 전체 통계(활성 아동·치료사·이번주 회기 수·미작성 기록)가 한 눈에 보입니다."),
        Step("아동 관리",
             "[아동 관리]에서 신규 등록·정보 수정·담당 치료사 배정을 합니다. 담당 미배정 아동만 골라보기, 검색, 치료사별 필터링 가능."),
        Step("치료사 시간표",
             "[치료사 시간표]에서 선생님별 월간 스케줄을 보고, 출석부(엑셀)를 다운로드해 출퇴근 관리에 활용하세요."),
        Step("엑셀 가져오기",
             "매월 전자바우처 엑셀을 받아오면 [엑셀 가져오기]로 일괄 업로드. 기존 아동은 자동 매칭, 신규는 새로 등록됩니다."),
        Step("치료사 관리",
             "[치료사 관리]에서 가입 신청 대기자 승인, 신규 치료사 등록, 비활성화 등을 처리합니다."),
    ],
    callouts=[
        Callout("tip", "행정 선생님 메뉴엔 일정표·기록지 작성이 없습니다. 치료사들이 직접 작성한 결과만 보고·관리 용도로 표시돼요."),
    ],
)

THERAPIST_SECTION = Section(
    title="치료사 선생님 가이드",
    intro="치료사 선생님은 본인이 담당하는 아동의 일정표·기록지만 작성합니다. 다른 선생님의 데이터는 보이지 않아 사생활이 보호돼요.",
    steps=[
        Step("가입 · 승인 대기",
             "원장님께 받은 <b>6자리 승인코드</b>로 가입합니다. 가입 직후엔 <b>승인 대기</b> 상태라 로그인이 안 됩니다. 원장님 승인 후 사용 가능."),
        Step("내 차단 시간 설정",
             "[내 차단 시간]에서 본인이 받기 어려운 요일·시간대를 등록하세요. 예: 월요일 09:00~09:50 = 본인 진료, 매주 금요일 종일 = 휴무. 시작·종료 시간은 일정표와 동일한 치료 시간대 드롭다운에서 선택합니다."),
        Step("아동 등록 · 수정",
             "[내 아동]에서 본인 담당 아동만 보이고, [아동 등록] 버튼으로 직접 등록할 수도 있어요. 등록 시 자동으로 본인에게 배정됩니다. 기본 요일·시간대·목표 회기 수도 수정 가능."),
        Step("일정표 작성",
             "[일정표]에서 아동·연·월을 선택하면, 기본 정보로 자동 채워집니다. 치료사 입력란에는 본인 이름이 자동으로 들어가요. 회기 시간이 다른 날만 수정하면 끝. [한글파일 만들기] 클릭 → .hwpx 다운로드."),
        Step("기록지 작성",
             "[기록지]에서 아동·연·월·회차별로 결과(목표·반응)를 입력합니다. 한 달에 5회기까지는 한 장, 그 이상이면 자동으로 여러 장 묶음 ZIP으로 다운."),
        Step("출석부 다운로드",
             "[치료사 시간표] 위쪽 [출석부 엑셀] 버튼으로 본인의 한 달 출석 기록을 엑셀로 받을 수 있어요. (※ 원장님이 보시는 메뉴와 동일하지만, 본인 데이터만 보입니다.)"),
    ],
    callouts=[
        Callout("warn", "기록지를 다른 치료사가 동시에 같은 아동에 대해 작성하면 마지막에 저장한 사람의 내용이 남습니다. 가급적 본인 담당 아동만 작성하세요."),
        Callout("info", "본인이 등록한 아동·기록지는 원장님 화면에는 보이지 않습니다. 다만 출석부·시간표는 운영 관리 목적으로 원장·행정 선생님이 확인할 수 있어요."),
    ],
)

FAQS = [
    FAQ("한글파일이 안 열려요",
        "한컴오피스(아래아한글) 2010 이상에서 .hwpx 형식을 열 수 있습니다. 무료 뷰어는 한컴 공식 사이트에서 받을 수 있어요. LibreOffice 등 다른 프로그램은 일부 서식이 깨질 수 있습니다."),
    FAQ("비밀번호를 잊었어요",
        "원장님께 말씀하세요. 원장님이 [치료사 관리]에서 비밀번호 초기화를 도와드릴 수 있습니다. (자가 초기화 기능은 추후 추가 예정)"),
    FAQ("한 번 작성한 기록지를 다시 수정할 수 있나요?",
        "네. 같은 아동·연·월로 다시 들어가면 기존 내용이 그대로 불러와집니다. 수정 후 다시 저장하세요."),
    FAQ("데이터가 안전한가요?",
        "모든 정보는 국내(춘천) 서버에 저장되고 HTTPS로 암호화 전송됩니다. 다른 센터의 데이터는 절대 보이지 않으며, 같은 센터 내에서도 권한(원장·행정·치료사)에 따라 보이는 범위가 달라요."),
    FAQ("모바일에서도 사용할 수 있나요?",
        "네. 스마트폰 브라우저로 https://baroilji.com 에 접속하면 모바일에 맞게 조정된 화면으로 동작합니다. 좌측 상단의 햄버거(☰) 버튼으로 메뉴를 열고 닫을 수 있어요."),
    FAQ("기능 추가나 수정 요청은 어디서?",
        "원장님께 의견을 모아 전달해주세요. 정기적으로 업데이트되며, 사용자가 늘면 더 많은 기능이 추가됩니다."),
]


# ─── 커스텀 Flowable: 콜아웃 박스 ─────────────────────────────────────────
class CalloutBox(Flowable):
    def __init__(self, kind: str, text: str, styles, width):
        super().__init__()
        self.kind = kind
        self.text = text
        self.styles = styles
        self.width = width
        self._para = Paragraph(text, styles["callout"])
        self._para.wrapOn(None, width - 32, 1000)
        self.height = self._para.height + 18

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        self._para = Paragraph(self.text, self.styles["callout"])
        w, h = self._para.wrap(availWidth - 32, availHeight)
        self.height = h + 18
        return availWidth, self.height

    def draw(self):
        c = self.canv
        bg, bd, icon = {
            "tip":  (COLOR_TIP_BG,  COLOR_TIP_BD,  "💡"),
            "warn": (COLOR_WARN_BG, COLOR_WARN_BD, "⚠"),
            "info": (COLOR_INFO_BG, COLOR_INFO_BD, "ℹ"),
        }[self.kind]
        c.setFillColor(bg)
        c.setStrokeColor(bd)
        c.setLineWidth(0.6)
        c.roundRect(0, 0, self.width, self.height, 4, stroke=1, fill=1)
        c.setFillColor(COLOR_TEXT)
        c.setFont("Noto-Bold", 10)
        c.drawString(10, self.height - 14, icon)
        self._para.drawOn(c, 28, 9)


# ─── 커스텀 Flowable: 단계 카드 ──────────────────────────────────────────
class StepCard(Flowable):
    def __init__(self, n: int, title: str, body: str, styles, width):
        super().__init__()
        self.n = n
        self.title = title
        self.body = body
        self.styles = styles
        self.width = width

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        self._t = Paragraph(self.title, self.styles["step_title"])
        self._b = Paragraph(self.body, self.styles["step_body"])
        tw, th = self._t.wrap(availWidth - 50, availHeight)
        bw, bh = self._b.wrap(availWidth - 50, availHeight)
        self.height = th + bh + 18
        return availWidth, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(COLOR_SURFACE)
        c.setStrokeColor(COLOR_BORDER)
        c.setLineWidth(0.5)
        c.roundRect(0, 0, self.width, self.height, 4, stroke=1, fill=1)
        # 번호 동그라미
        cx, cy, r = 22, self.height - 18, 10
        c.setFillColor(COLOR_PRIMARY)
        c.setStrokeColor(COLOR_PRIMARY)
        c.circle(cx, cy, r, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont("Noto-Bold", 10)
        c.drawCentredString(cx, cy - 3.5, str(self.n))
        # 텍스트
        self._t.drawOn(c, 40, self.height - self._t.height - 9)
        self._b.drawOn(c, 40, 9)


# ─── 커스텀 Flowable: 역할 배지 ──────────────────────────────────────────
class RoleBadgeRow(Flowable):
    def __init__(self, roles: list[str]):
        super().__init__()
        self.roles = roles
        self.width = 0
        self.height = 18

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        return availWidth, self.height

    def draw(self):
        c = self.canv
        x = 0
        for r in self.roles:
            p = ROLE_PALETTE[r]
            label = p["label"]
            c.setFont("Noto-Bold", 9)
            tw = c.stringWidth(label, "Noto-Bold", 9) + 18
            c.setFillColor(p["bg"])
            c.setStrokeColor(p["bd"])
            c.setLineWidth(0.5)
            c.roundRect(x, 0, tw, 16, 8, stroke=1, fill=1)
            c.setFillColor(p["fg"])
            c.drawCentredString(x + tw / 2, 5, label)
            x += tw + 6


# ─── 페이지 배경 / 헤더 / 푸터 ───────────────────────────────────────────
def make_page_decorator(role_key: str | None):
    """페이지 상하단에 배지·푸터 그려넣는 함수 반환."""
    def on_page(canv, doc):
        canv.saveState()
        # 상단 가는 줄
        canv.setStrokeColor(COLOR_BORDER)
        canv.setLineWidth(0.4)
        canv.line(20 * mm, A4[1] - 14 * mm, A4[0] - 20 * mm, A4[1] - 14 * mm)
        # 좌측 상단 워드마크
        canv.setFont("Noto-Bold", 9)
        canv.setFillColor(COLOR_PRIMARY_DARK)
        canv.drawString(20 * mm, A4[1] - 10 * mm, "바로일지")
        canv.setFont("Noto", 8.5)
        canv.setFillColor(COLOR_TEXT_MUTE)
        canv.drawString(20 * mm + 28, A4[1] - 10 * mm, "BAROILJI · 사용 설명서")
        # 우측 상단 역할 라벨
        if role_key and role_key in ROLE_PALETTE:
            label = ROLE_PALETTE[role_key]["label"] + " 매뉴얼"
            canv.setFont("Noto-Bold", 9)
            canv.setFillColor(ROLE_PALETTE[role_key]["fg"])
            canv.drawRightString(A4[0] - 20 * mm, A4[1] - 10 * mm, label)
        # 푸터
        canv.setFont("Noto", 8.5)
        canv.setFillColor(COLOR_TEXT_MUTE)
        canv.drawCentredString(A4[0] / 2, 10 * mm, f"— {doc.page} —")
        canv.drawString(20 * mm, 10 * mm, "https://baroilji.com")
        canv.drawRightString(A4[0] - 20 * mm, 10 * mm, "© 바로일지")
        canv.restoreState()
    return on_page


# ─── 표지 ─────────────────────────────────────────────────────────────────
def cover_flowables(role_key: str, role_label: str, styles, frame_width):
    elems = []
    # 빈 공간 위
    elems.append(Spacer(1, 70 * mm))
    elems.append(Paragraph("바로일지", styles["cover_title"]))
    elems.append(Paragraph("반복되는 일지 작성, 이제 바로 끝", styles["cover_sub"]))
    # 역할 배지 큼직하게
    badge_tbl = Table(
        [[Paragraph(f"<b>{role_label} 사용 설명서</b>", styles["cover_role"])]],
        colWidths=[100 * mm], rowHeights=[20 * mm],
    )
    pal = ROLE_PALETTE[role_key]
    badge_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), pal["bg"]),
        ("BOX", (0, 0), (-1, -1), 1, pal["bd"]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",  (0, 0), (-1, -1), "CENTER"),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))
    elems.append(badge_tbl)
    elems.append(Spacer(1, 12 * mm))
    elems.append(Paragraph(
        "이 매뉴얼은 바로일지를 처음 사용하시는 분들이<br/>"
        "역할에 맞는 기능을 빠르게 익힐 수 있도록 만들어졌습니다.",
        styles["cover_meta"]))
    elems.append(Spacer(1, 70 * mm))
    elems.append(Paragraph("© 바로일지 · https://baroilji.com", styles["cover_meta"]))
    elems.append(PageBreak())
    return elems


# ─── 본문 빌더 ─────────────────────────────────────────────────────────────
def section_flowables(section: Section, num: str, badges: list[str], styles, frame_width):
    elems = []
    # 헤더: 번호 + 제목 + 배지
    header_tbl = Table(
        [[
            Paragraph(f"<font color='{COLOR_PRIMARY.hexval()}'>{num}.</font> {section.title}", styles["h2"]),
            RoleBadgeRow(badges) if badges else "",
        ]],
        colWidths=[frame_width - 80, 80],
    )
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    elems.append(header_tbl)
    elems.append(Paragraph(section.intro, styles["body"]))
    elems.append(Spacer(1, 4))
    for i, step in enumerate(section.steps, 1):
        elems.append(KeepTogether(StepCard(i, step.title, step.body, styles, frame_width)))
        elems.append(Spacer(1, 8))
    for co in section.callouts:
        elems.append(CalloutBox(co.kind, co.text, styles, frame_width))
        elems.append(Spacer(1, 6))
    return elems


def faq_flowables(num: str, styles, frame_width):
    elems = []
    elems.append(Paragraph(
        f"<font color='{COLOR_PRIMARY.hexval()}'>{num}.</font> 자주 묻는 질문",
        styles["h2"]))
    for i, faq in enumerate(FAQS, 1):
        q_para = Paragraph(f"<b>Q{i}. {faq.q}</b>", styles["step_title"])
        a_para = Paragraph(faq.a, styles["step_body"])
        tbl = Table([[q_para], [a_para]], colWidths=[frame_width])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLOR_SURFACE_2),
            ("BOX",        (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        elems.append(KeepTogether(tbl))
        elems.append(Spacer(1, 6))
    return elems


def toc_flowables(items: list[tuple[str, str]], styles, frame_width):
    """간단한 목차 — (번호, 제목) 목록."""
    elems = [Paragraph(
        "<font color='%s'>목차</font>" % COLOR_PRIMARY_DARK.hexval(),
        styles["h2"])]
    rows = []
    for num, title in items:
        rows.append([
            Paragraph(f"<font color='{COLOR_PRIMARY.hexval()}'><b>{num}</b></font>", styles["body"]),
            Paragraph(title, styles["body"]),
        ])
    tbl = Table(rows, colWidths=[20, frame_width - 20])
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, COLOR_BORDER),
    ]))
    elems.append(tbl)
    elems.append(PageBreak())
    return elems


# ─── 빌더 ────────────────────────────────────────────────────────────────
def build_pdf(out_path: Path, role_key: str):
    """role_key in OWNER | ADMIN | THERAPIST."""
    role_label = ROLE_PALETTE[role_key]["label"]
    styles = make_styles()

    doc = BaseDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=22 * mm, bottomMargin=18 * mm,
        title=f"바로일지 {role_label} 사용 설명서",
        author="바로일지",
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        showBoundary=0,
    )
    page_tpl = PageTemplate(id="main", frames=[frame], onPage=make_page_decorator(role_key))
    doc.addPageTemplates([page_tpl])

    frame_width = doc.width

    # 역할별 섹션 구성
    if role_key == "OWNER":
        sections = [
            ("1", INTRO_SECTION,     ["OWNER", "ADMIN", "THERAPIST"]),
            ("2", OWNER_SECTION,     ["OWNER"]),
            ("3", ADMIN_SECTION,     ["ADMIN"]),
            ("4", THERAPIST_SECTION, ["THERAPIST"]),
        ]
        faq_num = "5"
    elif role_key == "ADMIN":
        sections = [
            ("1", INTRO_SECTION,     ["OWNER", "ADMIN", "THERAPIST"]),
            ("2", ADMIN_SECTION,     ["ADMIN"]),
            ("3", THERAPIST_SECTION, ["THERAPIST"]),
        ]
        faq_num = "4"
    else:  # THERAPIST
        sections = [
            ("1", INTRO_SECTION,     ["OWNER", "ADMIN", "THERAPIST"]),
            ("2", THERAPIST_SECTION, ["THERAPIST"]),
        ]
        faq_num = "3"

    story: list[Flowable] = []
    # 표지
    story += cover_flowables(role_key, role_label, styles, frame_width)
    # 목차
    toc_items = [(num, sec.title) for num, sec, _ in sections] + [(faq_num, "자주 묻는 질문")]
    story += toc_flowables(toc_items, styles, frame_width)
    # 본문
    for num, sec, badges in sections:
        story += section_flowables(sec, num, badges, styles, frame_width)
        story.append(Spacer(1, 10))
    # FAQ
    story += faq_flowables(faq_num, styles, frame_width)

    doc.build(story)


def main():
    out_dir = Path(__file__).resolve().parent.parent / "public" / "guides"
    out_dir.mkdir(parents=True, exist_ok=True)
    for role_key, filename in [
        ("OWNER",     "바로일지_원장용_설명서.pdf"),
        ("ADMIN",     "바로일지_행정용_설명서.pdf"),
        ("THERAPIST", "바로일지_치료사용_설명서.pdf"),
    ]:
        out_path = out_dir / filename
        build_pdf(out_path, role_key)
        size = out_path.stat().st_size / 1024
        print(f"✓ {filename}  ({size:.1f} KB)")


if __name__ == "__main__":
    main()
