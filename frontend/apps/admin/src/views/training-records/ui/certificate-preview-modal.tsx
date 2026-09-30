import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import {
  certificatePdfFileName,
  generateCertificatePdf,
} from "@/src/shared/utils/generate-certificate-pdf";
import type { TrainingRecord } from "@/src/entities/training-record";
import { postIssueCertificates } from "@/src/entities/certificate";
import {
  CertificateDocumentSheet,
  formatIssuedOnLabel,
  paginateRows,
  toSheetRows,
  type CertificateSheetPage,
  type CertificateSheetRow,
} from "./certificate-document-sheet";

/** A4 시트 원본 폭 @96dpi — 미리보기 스케일 계산용 */
const SHEET_WIDTH = 794;
const PREVIEW_SCALE = 0.82;

/** 확인서 서식 표기 고정문 — 폐지된 form_no 대신 항상 같은 값을 인쇄한다 */
const CERT_FORM_NO = "제31호";

/** 교육생별 다중 발급 묶음 — 한 교육생의 선택 이력을 한 PDF(페이지 N장)로 */
export interface CertificateDownloadGroup {
  key: string;
  traineeName: string;
  supervisorGrade: string | null;
  supervisorCertNo: string | null;
  /** 확인서 서식 표기는 고정문 — 데이터가 아니다 (form_no 는 폐지됨) */
  formNo: string;
  /** 이 묶음에 들어갈 내역 id — 발급 저장(POST /certificates/issue) 요청 본문 */
  recordIds: string[];
  /** 묶음에 포함된 교육명 목록 — PDF 파일명(교육명 기반)에 쓴다 */
  courseNames: string[];
  /** 빈 행으로 채우지 않은 원본 행 — 미리보기에서 여러 페이지를 한 문서로 이어 보여줄 때 쓴다 */
  rows: CertificateSheetRow[];
  pages: CertificateSheetPage[];
  /** 문서 전체 총 이수시간 — 마지막 페이지 합계 표기 */
  totalHours: number;
  issuedOnLabel: string;
}

/** 선택 이력 → 교육생별 묶음. 머리 표기(등급·서식)는 첫 이력 값, 문서번호는 발급 시 부여 */
export function buildDownloadGroups(records: TrainingRecord[]): CertificateDownloadGroup[] {
  const issuedOnLabel = formatIssuedOnLabel(new Date());
  // 이력 행을 교육생별로 전부 모은 뒤 페이지로 나눈다 — 건별로 나누면
  // 한 페이지에 행 1개짜리 페이지가 이력 수만큼 생긴다
  const rowsByTrainee = new Map<
    string,
    Omit<CertificateDownloadGroup, "pages" | "totalHours"> & { rows: CertificateSheetRow[] }
  >();
  for (const record of records) {
    let group = rowsByTrainee.get(record.traineeId);
    if (!group) {
      group = {
        key: record.traineeId,
        traineeName: record.traineeName ?? "",
        supervisorGrade: record.supervisorGrade,
        supervisorCertNo: record.supervisorCertNo,
        formNo: CERT_FORM_NO,
        recordIds: [],
        courseNames: [],
        rows: [],
        issuedOnLabel,
      };
    }
    group.recordIds.push(record.id);
    group.courseNames.push(record.courseName);
    group.rows.push(...toSheetRows([record]));
    rowsByTrainee.set(record.traineeId, group);
  }
  return [...rowsByTrainee.values()].map(({ rows, ...header }) => ({
    ...header,
    rows,
    pages: paginateRows(rows),
    totalHours: rows.reduce((sum, row) => sum + row.hours, 0),
  }));
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 미리보기 대상 이력들 — 행 액션은 1건, 일괄 발급은 선택 전체 */
  records: TrainingRecord[];
  /** 발급·다운로드가 성공한 내역 id — 목록에서 선택 해제할 때 쓴다 */
  onDownloaded?: (recordIds: string[]) => void;
}

/**
 * 연속 문서 축소 미리보기 — 원본 폭으로 그린 뒤 transform 으로 축소한다.
 *
 * zoom 은 쓰지 않는다 — 바깥 래퍼가 zoom 된 자식의 높이를 짧게 재서 하단
 * 마감(합계·증명·인감)이 클리고, 스크롤 컨테이너의 scrollHeight 도 같이
 * 줄어 스크롤이 끝까지 안 되었다. transform 은 레이아웃 높이를 안 바꾸므로
 * 자식의 실제 높이(ResizeObserver 실측) × 축소율을 래퍼 높이로 준다.
 */
function ScaledContinuousPreview({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight * PREVIEW_SCALE);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      style={{
        width: SHEET_WIDTH * PREVIEW_SCALE,
        height,
        margin: "0 auto",
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: SHEET_WIDTH,
          transform: `scale(${PREVIEW_SCALE})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * 확인서 미리보기 모달 — WEB 발급 화면과 같은 서식을 축소 노출.
 * 여러 건이면 교육생별로 묶어 각 교육생이 한 PDF(페이지 N장)가 되고,
 * 전체 다운로드는 교육생 수만큼 파일을 저장한다.
 *
 * 다운로드 = 발급 저장이다. 문서번호(정감 제{YY}-E{NNNN}호)는 내역이 아니라
 * 발급 건에 부여되므로, PDF를 만들기 전 POST /certificates/issue 로 발급을
 * 확정해 부여된 번호를 시트에 반영한다. 미리보기 단계엔 번호가 없다.
 *
 * 실제 PDF는 숨은 컨테이너의 원본 크기 시트를 캔버스로 래스터화해 만든다
 * (transform 스케일이 걸린 노드는 캡처가 어긋난다).
 */
export function CertificatePreviewModal({ isOpen, onClose, records, onDownloaded }: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  // traineeId → 발급 저장으로 부여된 문서번호·묶음 확인서 번호. 미리보기(발급 전)엔 비어 있다
  const [docNosByTrainee, setDocNosByTrainee] = useState<Record<string, string>>({});
  const docNosRef = useRef<Record<string, string>>({});
  const [certNosByTrainee, setCertNosByTrainee] = useState<Record<string, string>>({});
  const certNosRef = useRef<Record<string, string>>({});

  // 모달이 닫히면 발급 상태를 비운다 — 다음 열림은 새 발급 건
  useEffect(() => {
    if (!isOpen) {
      docNosRef.current = {};
      setDocNosByTrainee({});
      certNosRef.current = {};
      setCertNosByTrainee({});
    }
  }, [isOpen]);

  const groups = isOpen ? buildDownloadGroups(records) : [];
  const recordCount = records.length;

  const handleDownloadAll = async () => {
    const container = captureRef.current;
    if (!container) return;
    setIsDownloading(true);
    try {
      // 아직 발급 저장이 안 된 묶음을 먼저 확정 — 문서번호는 이 호출로 부여된다.
      // 이미 발급된 내역이 섞여 있어도 독립 문서로 새로 발급된다(회원 유효본은 폐기되지 않음)
      const pending = groups.filter((group) => !docNosRef.current[group.key]);
      if (pending.length > 0) {
        const { groups: results } = await postIssueCertificates({
          groups: pending.map((group) => ({
            traineeId: group.key,
            recordIds: group.recordIds,
          })),
        });
        for (const result of results) {
          docNosRef.current[result.traineeId] = result.docNo;
          certNosRef.current[result.traineeId] = result.certificateNo;
        }
        setDocNosByTrainee({ ...docNosRef.current });
        setCertNosByTrainee({ ...certNosRef.current });
        // 부여된 번호가 찍힌 시트로 재렌더된 뒤 캡처한다
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      let savedCount = 0;
      for (const group of groups) {
        const els = Array.from(
          container.querySelectorAll<HTMLElement>(`[data-group="${group.key}"] [data-sheet-page]`),
        );
        if (els.length === 0) continue;
        await generateCertificatePdf(
          els,
          certificatePdfFileName(group.courseNames, "교육 확인서"),
        );
        savedCount += 1;
      }
      toast.success(
        savedCount > 1 ? `확인서 ${savedCount}개 파일을 저장했어요` : "PDF를 저장했어요",
      );
      onDownloaded?.(groups.flatMap((group) => group.recordIds));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "발급에 실패했어요");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title="확인서 미리보기"
        description={
          groups.length > 1
            ? `${groups.length}명의 감리원 · 내역 ${recordCount}건 — 감리원별 PDF로 저장돼요`
            : groups[0]
              ? `${groups[0].traineeName || "감리원"} · 내역 ${recordCount}건`
              : undefined
        }
        size="xl"
        actions={[
          { label: "닫기", onClick: onClose },
          {
            label: groups.length > 1 ? "전체 발급·다운로드" : "발급 후 PDF 저장",
            variant: "primary",
            isLoading: isDownloading,
            onClick: handleDownloadAll,
          },
        ]}
      >
        {Object.keys(docNosByTrainee).length === 0 && (
          <p className="mb-3 text-[12px] text-ink-3">
            문서번호는 저장 시 발급 건마다 자동으로 부여돼요 — 내역마다가 아니라 발급 1건에 번호 1개예요
          </p>
        )}
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-line bg-bg p-4">
          {groups.map((group) => (
            <section key={group.key} className="mb-6 last:mb-0">
              {groups.length > 1 && (
                <h3 className="mb-2 text-[13px] font-medium text-ink">
                  {group.traineeName || "감리원"} · {group.pages.length}페이지
                  {docNosByTrainee[group.key] && (
                    <span className="ml-2 font-normal text-ink-2">
                      {docNosByTrainee[group.key]}
                    </span>
                  )}
                </h3>
              )}
              {/* 미리보기는 항상 연속 문서 1장으로 보여준다 — 페이지별 고정 높이
                  박스(overflow hidden)는 내용이 A4 용량을 넘면 하단 마감(합계·증명·인감)이
                  통째로 잘리고 스크롤도 불가하다. 페이지 분할은 PDF(캡처 컨테이너)가 담당 */}
              <ScaledContinuousPreview>
                <CertificateDocumentSheet
                  continuous
                  memberName={group.traineeName}
                  supervisorGrade={group.supervisorGrade}
                  supervisorCertNo={group.supervisorCertNo}
                  formNo={group.formNo}
                  docNo={docNosByTrainee[group.key] ?? null}
                  certificateNumber={certNosByTrainee[group.key] ?? null}
                  rows={group.rows}
                  totalHours={group.totalHours}
                  issuedOnLabel={group.issuedOnLabel}
                />
              </ScaledContinuousPreview>
            </section>
          ))}
        </div>
      </Dialog>

      {/* 캡처 전용 원본 크기 시트 — 화면 밖에 두고 PDF 생성에만 쓴다 */}
      <div aria-hidden style={{ position: "fixed", left: -20000, top: 0 }} ref={captureRef}>
        {isOpen &&
          groups.map((group) => (
            <div key={group.key} data-group={group.key}>
              {group.pages.map((page, pageIndex) => (
                <div key={pageIndex} data-sheet-page>
                  {/* 확인서 번호는 모든 페이지 하단에 같은 번호로 들어간다(협회 발급 방식).
                      페이지 용량 상수가 번호 줄을 빼고 잡혀 있어 잘리지 않는다 */}
                  <CertificateDocumentSheet
                    memberName={group.traineeName}
                    supervisorGrade={group.supervisorGrade}
                    supervisorCertNo={group.supervisorCertNo}
                    formNo={group.formNo}
                    docNo={docNosByTrainee[group.key] ?? null}
                    certificateNumber={certNosByTrainee[group.key] ?? null}
                    rows={page.rows}
                    showHead={page.showHead}
                    showClosing={page.showClosing}
                    startNo={page.startNo}
                    pageNo={pageIndex + 1}
                    pageCount={group.pages.length}
                    totalHours={group.totalHours}
                    issuedOnLabel={group.issuedOnLabel}
                  />
                </div>
              ))}
            </div>
          ))}
      </div>
    </>
  );
}
