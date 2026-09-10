import type { ReactNode } from "react";

import {
  CaretDown16Icon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretLineLeftIcon,
  CaretLineRightIcon,
  CaretRightIcon,
  CaretUp16Icon,
  CaretUpDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CheckIcon,
  CheckSmIcon,
  ClockIcon,
  FileArrowDownIcon,
  InfoIcon,
  PencilSimpleIcon,
  ResizeGripIcon,
  TimerIcon,
  UploadIcon,
  WarningCircleIcon,
  XCircleIcon,
  XIcon,
} from "@/src/shared/icon";
import {
  Button,
  Checkbox,
  Chip,
  Dropdown,
  Radio,
  TableCell,
  TableHeader,
  TableRow,
  Table,
} from "@/src/shared/ui";

import { Demo, DemoRow, DemoSection } from "./demo-section";

const CELL_DROPDOWN_OPTIONS = [
  { value: "active", label: "활성" },
  { value: "paused", label: "일시중지" },
];

const ICONS: { name: string; icon: ReactNode }[] = [
  { name: "CaretDown", icon: <CaretDownIcon /> },
  { name: "CaretDown16", icon: <CaretDown16Icon /> },
  { name: "CaretLeft", icon: <CaretLeftIcon /> },
  { name: "CaretLineLeft", icon: <CaretLineLeftIcon /> },
  { name: "CaretLineRight", icon: <CaretLineRightIcon /> },
  { name: "CaretRight", icon: <CaretRightIcon /> },
  { name: "CaretUp", icon: <CaretUpIcon /> },
  { name: "CaretUp16", icon: <CaretUp16Icon /> },
  { name: "CaretUpDown", icon: <CaretUpDownIcon /> },
  { name: "Check", icon: <CheckIcon /> },
  { name: "CheckCircle", icon: <CheckCircleIcon /> },
  { name: "CheckSm", icon: <CheckSmIcon /> },
  { name: "Clock", icon: <ClockIcon /> },
  { name: "FileArrowDown", icon: <FileArrowDownIcon /> },
  { name: "Info", icon: <InfoIcon /> },
  { name: "PencilSimple", icon: <PencilSimpleIcon /> },
  { name: "ResizeGrip", icon: <ResizeGripIcon /> },
  { name: "Timer", icon: <TimerIcon /> },
  { name: "Upload", icon: <UploadIcon /> },
  { name: "WarningCircle", icon: <WarningCircleIcon /> },
  { name: "X", icon: <XIcon /> },
  { name: "XCircle", icon: <XCircleIcon /> },
];

/** Table 전 셀 타입 + 아이콘 전 목록 */
export function SectionTable() {
  return (
    <DemoSection title="Table / Icons">
      <DemoRow>
        <Demo label="Table — size l (전 셀 타입 조합)" className="w-fit">
          <Table className="w-fit">
            <TableRow>
              <TableHeader type="checkbox" />
              <TableHeader text="이름" sort sortingType="down" onSort={() => {}} />
              <TableHeader text="상태" sort sortingType="up" onSort={() => {}} />
              <TableHeader text="정렬 없음" sort sortingType="off" onSort={() => {}} />
              <TableHeader text="등록일" />
            </TableRow>
            <TableRow>
              <TableCell type="checkbox">
                <Checkbox size="s" defaultChecked aria-label="행 1 선택" />
              </TableCell>
              <TableCell>항목 1</TableCell>
              <TableCell type="badge">
                <Chip color="lnpGreen">진행중</Chip>
              </TableCell>
              <TableCell type="button">
                <Button size="s">편집</Button>
              </TableCell>
              <TableCell type="dropdown">
                <Dropdown
                  className="w-full"
                  size="s"
                  options={CELL_DROPDOWN_OPTIONS}
                  defaultValue="active"
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell type="checkbox">
                <Checkbox size="s" aria-label="행 2 선택" />
              </TableCell>
              <TableCell>항목 2</TableCell>
              <TableCell type="badge">
                <Chip color="red">중단</Chip>
              </TableCell>
              <TableCell type="radio">
                <Radio name="table-row" size="s" defaultChecked aria-label="행 2 라디오" />
              </TableCell>
              <TableCell>2026-09-08</TableCell>
            </TableRow>
          </Table>
        </Demo>
        <Demo label="Table — size m" className="w-fit">
          <Table className="w-fit">
            <TableRow>
              <TableHeader type="checkbox" size="m" />
              <TableHeader text="이름" size="m" />
              <TableHeader text="상태" size="m" />
            </TableRow>
            <TableRow>
              <TableCell type="checkbox" size="m">
                <Checkbox size="s" aria-label="m 행 1 선택" />
              </TableCell>
              <TableCell size="m">항목 1</TableCell>
              <TableCell size="m">2026-09-08</TableCell>
            </TableRow>
            <TableRow>
              <TableCell type="checkbox" size="m">
                <Checkbox size="s" defaultChecked aria-label="m 행 2 선택" />
              </TableCell>
              <TableCell size="m">항목 2</TableCell>
              <TableCell size="m">2026-09-07</TableCell>
            </TableRow>
          </Table>
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="Icons — 전 22종 (currentColor, text-gray-700)">
          <div className="grid max-w-[900px] grid-cols-8 gap-4">
            {ICONS.map(({ name, icon }) => (
              <div
                key={name}
                className="flex flex-col items-center gap-1.5 text-gray-700"
              >
                <span className="size-6">{icon}</span>
                <span className="text-[10px] text-gray-400">{name}</span>
              </div>
            ))}
          </div>
        </Demo>
      </DemoRow>
    </DemoSection>
  );
}
