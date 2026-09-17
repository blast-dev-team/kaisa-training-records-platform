import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Button } from '@/src/shared/ui/button';
import { Dialog } from '@/src/shared/ui/dialog';
import { Input } from '@/src/shared/ui/input';
import { Label } from '@/src/shared/ui/label';
import { Select } from '@/src/shared/ui/select';
import { Textarea } from '@/src/shared/ui/textarea';
import { membershipGradeQueries, traineeQueries, type Trainee } from '@/src/entities/trainee';
import {
  identityReviewQueries,
  postApproveIdentityReview,
  postRejectIdentityReview,
  type IdentityReview,
} from '@/src/entities/identity-review';

interface Props {
  review: IdentityReview | null;
  onClose: () => void;
}

/**
 * 본인인증 수동 심사 — 전화번호는 암호화 저장이라 검색이 안 된다.
 * 성명 검색 → phone_masked 를 눈으로 대조해서 교육생을 연결한다 (설계 확정).
 */
export function ReviewDialog({ review, onClose }: Props) {
  const queryClient = useQueryClient();

  /** 연결 방식 — 검색으로 기존 교육생 대조 or 검색 실패 시 신규 생성 */
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const [selected, setSelected] = useState<Trainee | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [note, setNote] = useState('');

  const { data: grades } = useQuery(membershipGradeQueries.list(true));
  const { data: results, isFetching: searching } = useQuery({
    ...traineeQueries.list({ q: query ?? '', page: 1, limit: 10 }),
    enabled: query !== null,
  });

  useEffect(() => {
    if (review) {
      setMode('search');
      setSearch(review.verifiedName);
      setQuery(null);
      setSelected(null);
      setNewName(review.verifiedName);
      setNewPhone('');
      setNewEmail('');
      setGradeId('');
      setNote('');
    }
  }, [review]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: identityReviewQueries.all() });

  /** 신규 생성 모드 — 성명·등급 필수 (등급 없으면 발급이 막힌다) */
  const canApprove =
    mode === 'search' ? selected !== null : newName.trim() !== '' && gradeId !== '';

  const approveMutation = useMutation({
    mutationFn: () => {
      const input =
        mode === 'search'
          ? {
              trainee_id: selected!.id,
              determined_grade_id: gradeId || undefined,
            }
          : {
              new_trainee: {
                name: newName.trim(),
                phone: newPhone.trim() || undefined,
                email: newEmail.trim() || undefined,
              },
              determined_grade_id: gradeId,
            };
      return postApproveIdentityReview(review!.id, input);
    },
    onSuccess: () => {
      toast.success(mode === 'new' ? '신규 교육생을 생성하고 연결했어요' : '심사를 승인했어요');
      invalidate();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: () => postRejectIdentityReview(review!.id, { review_note: note.trim() }),
    onSuccess: () => {
      toast.success('심사를 거절했어요');
      invalidate();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = approveMutation.isPending || rejectMutation.isPending;

  const runSearch = (value: string) => setQuery(value.trim() || null);

  return (
    <Dialog
      isOpen={review !== null}
      onClose={onClose}
      size="xl"
      title="본인인증 수동 심사"
      description="성명으로 교육생을 찾아 전화번호(마스킹)를 눈으로 대조한 뒤 연결해 주세요"
      actions={[
        {
          label: '거절',
          variant: 'secondary',
          isLoading: rejectMutation.isPending,
          isDisabled: busy || !note.trim(),
          onClick: () => rejectMutation.mutate(),
        },
        {
          label: mode === 'new' ? '생성 후 승인' : '승인',
          variant: 'primary',
          isLoading: approveMutation.isPending,
          isDisabled: busy || !canApprove,
          onClick: () => approveMutation.mutate(),
        },
      ]}
    >
      {review && (
        <div className="space-y-5 pt-1">
          {/* 신청 정보 */}
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-line bg-panel-2/40 p-4 text-[13px]">
            <div>
              <p className="text-[11px] text-ink-3">회원 계정명</p>
              <p className="mt-0.5 font-medium text-ink">{review.userName}</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-3">인증 성명</p>
              <p className="mt-0.5 font-medium text-ink">{review.verifiedName}</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-3">인증 전화</p>
              <p className="mt-0.5 font-medium font-mono text-[12px] text-ink">
                {review.verifiedPhoneMasked}
              </p>
            </div>
          </div>

          {/* 교육생 연결 — 검색 대조 or 신규 생성 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{mode === 'new' ? '신규 교육생 생성' : '교육생 연결 — 성명 검색'}</Label>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'search' ? 'new' : 'search');
                  setQuery(null);
                }}
                className="text-[12px] font-medium text-accent hover:underline"
              >
                {mode === 'search' ? '신규 교육생으로 생성' : '기존 검색으로 돌아가기'}
              </button>
            </div>

            {mode === 'search' && (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="교육생 성명"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      runSearch(search);
                    }
                  }}
                />
                <Button variant="secondary" size="sm" onClick={() => runSearch(search)}>
                  검색
                </Button>
              </div>
            )}

            {mode === 'search' ? (
              selected ? (
                <div className="flex items-center justify-between rounded-md border border-accent-soft bg-accent-soft px-3 py-2.5">
                  <div className="text-[13px]">
                    <span className="font-medium text-accent-ink">
                      {selected.traineeNo} · {selected.name}
                    </span>
                    <span className="ml-2 font-mono text-[12px] text-accent-ink">
                      {selected.phoneMasked}
                    </span>
                    <span
                      className={`ml-2 text-[12px] font-medium ${
                        selected.phoneMasked === review.verifiedPhoneMasked
                          ? 'text-ok'
                          : 'text-warn'
                      }`}
                    >
                      {selected.phoneMasked === review.verifiedPhoneMasked
                        ? '전화 일치'
                        : '전화 불일치 — 신중히 확인'}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                    변경
                  </Button>
                </div>
              ) : query !== null ? (
                <div className="max-h-48 overflow-y-auto scrollbar-thin rounded-md border border-line divide-y divide-line-2">
                  {searching ? (
                    <p className="px-3 py-2 text-[13px] text-ink-3">검색 중...</p>
                  ) : (results?.items ?? []).length === 0 ? (
                    <p className="px-3 py-2 text-[13px] text-ink-3">
                      검색 결과가 없어요 — 신규 교육생이라면 승인이 아니라 거절 후 별도 등록이
                      필요해요
                    </p>
                  ) : (
                    (results?.items ?? []).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="block w-full px-3 py-2.5 text-left hover:bg-panel-2"
                        onClick={() => {
                          setSelected(t);
                          setQuery(null);
                        }}
                      >
                        <span className="text-[13px] font-medium text-ink">{t.name}</span>
                        <span className="ml-2 text-[12px] text-ink-3">{t.traineeNo}</span>
                        <span className="ml-2 font-mono text-[12px] text-ink-2">
                          {t.phoneMasked}
                          <span
                            className={`ml-1.5 not-italic font-sans ${
                              t.phoneMasked === review.verifiedPhoneMasked ? 'text-ok' : 'text-warn'
                            }`}
                          >
                            {t.phoneMasked === review.verifiedPhoneMasked ? '일치' : '불일치'}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null
            ) : (
              <div className="space-y-3 rounded-md border border-line p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>성명</Label>
                    <Input
                      placeholder="교육생 성명 (인증 성명으로 채워짐)"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>전화번호 (선택)</Label>
                    <Input
                      placeholder="01012345678"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>이메일 (선택)</Label>
                  <Input
                    placeholder="trainee@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-ink-3">
                  생성과 연결이 한 번에 처리돼요 — 교육생 목록에 바로 반영돼요. 성명·전화는 나중에
                  수정 가능해요
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{mode === 'new' ? '확정 등급 (필수)' : '확정 등급 (선택)'}</Label>
            <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
              {(grades ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>심사 메모 · 거절 사유</Label>
            <Textarea
              rows={2}
              placeholder="승인 시 참고 사항 (선택) · 거절할 때는 사유를 남겨 주세요 — 이력으로 남아요"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      )}
    </Dialog>
  );
}
