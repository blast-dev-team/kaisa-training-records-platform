import { useState } from "react";

import { CheckIcon, TimerIcon } from "@/src/shared/icon";
import {
  Button,
  Chip,
  Dropdown,
  Profile,
  UploadButton,
  UploadedFile,
} from "@/src/shared/ui";

import { Demo, DemoRow, DemoSection } from "./demo-section";

const CHIP_COLORS = [
  "gray",
  "lnpGreen",
  "yellow",
  "orange",
  "red",
  "green",
  "indigo",
  "violet",
] as const;

const DROPDOWN_OPTIONS = [
  { value: "option1", label: "옵션 1" },
  { value: "option2", label: "옵션 2" },
  { value: "option3", label: "옵션 3 (비활성)", disabled: true },
  { value: "option4", label: "옵션 4" },
];

/** Dropdown · Chip · Profile · UploadButton · UploadedFile 전 변형 */
export function SectionSelection() {
  const [chips, setChips] = useState(["제거 가능한 칩", "제거 가능한 칩 2"]);
  const [files, setFiles] = useState([
    { name: "구조확인서.pdf", size: "1.2mb" },
    { name: "실험데이터.sdf", size: "480kb" },
  ]);

  return (
    <DemoSection title="Dropdown / Chip / Profile / UploadButton / UploadedFile">
      <DemoRow>
        <Demo label="Dropdown — 단일 선택" className="w-[335px]">
          <Dropdown className="w-full" options={DROPDOWN_OPTIONS} placeholder="Placeholder" />
        </Demo>
        <Demo label="Dropdown — label + essential + 초기값" className="w-[335px]">
          <Dropdown
            className="w-full"
            label="Label"
            essential
            options={DROPDOWN_OPTIONS}
            defaultValue="option1"
          />
        </Demo>
        <Demo label="Dropdown — multiple (칩 표시)" className="w-[335px]">
          <Dropdown
            className="w-full"
            multiple
            options={DROPDOWN_OPTIONS}
            defaultValue={["option1", "option2"]}
          />
        </Demo>
        <Demo label="Dropdown — size s" className="w-[335px]">
          <Dropdown className="w-full" size="s" options={DROPDOWN_OPTIONS} placeholder="Placeholder" />
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="Chip — color 8종">
          <div className="flex flex-wrap gap-2">
            {CHIP_COLORS.map((color) => (
              <Chip key={color} color={color}>
                {color}
              </Chip>
            ))}
          </div>
        </Demo>
        <Demo label="Chip — shape square × size s/m/l">
          <div className="flex items-center gap-2">
            <Chip shape="square" size="s" color="lnpGreen">
              s
            </Chip>
            <Chip shape="square" size="m" color="orange">
              m
            </Chip>
            <Chip shape="square" size="l" color="red">
              l
            </Chip>
          </div>
        </Demo>
        <Demo label="Chip — icon / onlyIcon">
          <div className="flex items-center gap-2">
            <Chip color="lnpGreen" icon={<CheckIcon />}>
              아이콘
            </Chip>
            <Chip color="indigo" icon={<TimerIcon />} aria-label="타이머" />
          </div>
        </Demo>
        <Demo label="Chip — onRemove (클릭 시 실제 제거)">
          <div className="flex items-center gap-2">
            {chips.map((chip) => (
              <Chip
                key={chip}
                color="violet"
                onRemove={() =>
                  setChips((prev) => prev.filter((c) => c !== chip))
                }
              >
                {chip}
              </Chip>
            ))}
            {chips.length === 0 && (
              <Button onClick={() => setChips(["제거 가능한 칩", "제거 가능한 칩 2"])}>
                칩 복원
              </Button>
            )}
          </div>
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="Profile — size s/m/l/xl">
          <div className="flex items-end gap-4">
            <Profile size="s" alt="기본 로고 s" />
            <Profile size="m" alt="기본 로고 m" />
            <Profile size="l" alt="기본 로고 l" />
            <Profile size="xl" alt="기본 로고 xl" />
          </div>
        </Demo>
        <Demo label="Profile — onEdit">
          <div className="flex items-end gap-4">
            <Profile size="m" alt="편집 가능" onEdit={() => {}} />
            <Profile size="xl" alt="편집 가능 xl" onEdit={() => {}} />
          </div>
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="UploadButton — 기본">
          <UploadButton />
        </Demo>
        <Demo label="UploadButton — 라벨/안내 교체">
          <UploadButton label="파일 추가" hint="최대 50MB" formats="pdf, hwp" />
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="UploadedFile — xButton on (X 클릭 시 실제 제거)">
          <div className="flex flex-col gap-2">
            {files.map((file) => (
              <UploadedFile
                key={file.name}
                fileName={file.name}
                fileSize={file.size}
                onRemove={() =>
                  setFiles((prev) => prev.filter((f) => f.name !== file.name))
                }
              />
            ))}
          </div>
        </Demo>
        <Demo label="UploadedFile — xButton off">
          <UploadedFile fileName="보고서.docx" fileSize="340kb" />
        </Demo>
      </DemoRow>
    </DemoSection>
  );
}
