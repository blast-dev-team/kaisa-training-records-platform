import { useState } from "react";

import { InfoIcon } from "@/src/shared/icon";
import {
  Checkbox,
  DatePicker,
  Radio,
  Slider,
  TextArea,
  TextField,
  TimeSelection,
  type TimeSelectionValue,
} from "@/src/shared/ui";

import { Demo, DemoRow, DemoSection } from "./demo-section";

const today = new Date(new Date().setHours(0, 0, 0, 0));

/** TextField · TextArea · Checkbox · Radio · Slider · DatePicker · TimeSelection 전 변형 */
export function SectionInputs() {
  const [timeValue, setTimeValue] = useState<TimeSelectionValue | null>(null);

  return (
    <DemoSection title="TextField / TextArea / Checkbox / Radio / Slider / DatePicker / TimeSelection">
      <DemoRow>
        <Demo label="TextField — active/value" className="w-[335px]">
          <TextField
            className="w-full"
            placeholder="Placeholder"
            defaultValue="입력된 값"
          />
        </Demo>
        <Demo label="TextField — label + helper + essential" className="w-[335px]">
          <TextField
            className="w-full"
            label="Label"
            helperText="Helper text"
            essential
            placeholder="Placeholder"
          />
        </Demo>
        <Demo label="TextField — error" className="w-[335px]">
          <TextField
            className="w-full"
            label="Label"
            error
            helperText="에러 메시지"
            defaultValue="잘못된 값"
          />
        </Demo>
        <Demo label="TextField — disabled" className="w-[335px]">
          <TextField
            className="w-full"
            disabled
            placeholder="Placeholder"
            defaultValue="비활성"
          />
        </Demo>
        <Demo label="TextField — rightIcon" className="w-[335px]">
          <TextField
            className="w-full"
            placeholder="Placeholder"
            rightIcon={<InfoIcon />}
          />
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="TextArea — 기본" className="w-[335px]">
          <TextArea className="w-full" placeholder="Placeholder" />
        </Demo>
        <Demo label="TextArea — label + helper + essential" className="w-[335px]">
          <TextArea
            className="w-full"
            label="Label"
            helperText="Helper text"
            essential
            placeholder="Placeholder"
          />
        </Demo>
        <Demo label="TextArea — error + letterLimit" className="w-[335px]">
          <TextArea
            className="w-full"
            label="Label"
            error
            helperText="에러 메시지"
            letterLimit={100}
            defaultValue="에러 상태"
          />
        </Demo>
        <Demo label="TextArea — disabled" className="w-[335px]">
          <TextArea
            className="w-full"
            disabled
            placeholder="Placeholder"
            defaultValue="비활성"
          />
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="Checkbox — m/s × 선택 × disabled">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Checkbox defaultChecked>선택됨</Checkbox>
              <Checkbox>미선택</Checkbox>
              <Checkbox disabled>disabled</Checkbox>
              <Checkbox defaultChecked disabled>
                선택+disabled
              </Checkbox>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox size="s" defaultChecked>
                s 선택
              </Checkbox>
              <Checkbox size="s">s 미선택</Checkbox>
              <Checkbox size="s" disabled>
                s disabled
              </Checkbox>
            </div>
          </div>
        </Demo>
        <Demo label="Checkbox — text 없음">
          <div className="flex items-center gap-2">
            <Checkbox defaultChecked aria-label="선택" />
            <Checkbox aria-label="미선택" />
          </div>
        </Demo>
        <Demo label="Checkbox — outline 카드 m/s">
          <div className="flex flex-col gap-2">
            <Checkbox outline defaultChecked>
              outline m — 선택
            </Checkbox>
            <Checkbox outline>outline m — 미선택</Checkbox>
            <Checkbox outline size="s" defaultChecked>
              outline s — 선택
            </Checkbox>
          </div>
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="Radio — m/s × 선택 × disabled (name=plan)">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Radio name="plan-m" defaultChecked>
                선택됨
              </Radio>
              <Radio name="plan-m">미선택</Radio>
              <Radio name="plan-m" disabled>
                disabled
              </Radio>
              <Radio name="plan-m" defaultChecked disabled>
                선택+disabled
              </Radio>
            </div>
            <div className="flex items-center gap-2">
              <Radio name="plan-s" size="s" defaultChecked>
                s 선택
              </Radio>
              <Radio name="plan-s" size="s">
                s 미선택
              </Radio>
            </div>
          </div>
        </Demo>
        <Demo label="Radio — outline 카드 m (name=plan-card)">
          <div className="flex flex-col gap-2">
            <Radio name="plan-card" outline defaultChecked>
              outline — 선택
            </Radio>
            <Radio name="plan-card">outline — 미선택</Radio>
          </div>
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="Slider — 기본 (3단계)">
          <Slider defaultLevel={2} />
        </Demo>
        <Demo label="Slider — leftText/rightText/valueText">
          <Slider
            defaultLevel={2}
            leftText="1단계"
            rightText="3단계"
            valueText="2단계 — 활성 핸들 포커스 시 표시"
          />
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="DatePicker — 기본">
          <DatePicker />
        </Demo>
        <Demo label="DatePicker — 초기값 + 과거 비활성">
          <DatePicker
            defaultValue={new Date()}
            isDisabledDate={(date) => date < today}
          />
        </Demo>
        <div className="flex flex-col gap-4">
          <Demo label="TimeSelection — input + meridiem (기본)">
            <TimeSelection onChange={setTimeValue} />
          </Demo>
          <Demo label="TimeSelection — input + label + icon">
            <TimeSelection label="시간" icon onChange={setTimeValue} />
          </Demo>
          <Demo label="TimeSelection — dropdown + meridiem">
            <TimeSelection variant="dropdown" onChange={setTimeValue} />
          </Demo>
          <Demo label="TimeSelection — dropdown + label + icon + 24시간제">
            <TimeSelection
              label="시간"
              icon
              variant="dropdown"
              meridiem={false}
              onChange={setTimeValue}
            />
          </Demo>
          <Demo label="onChange 값">
            <p className="text-sm text-gray-700">
              {timeValue
                ? `${timeValue.hour}:${timeValue.minute}${
                    timeValue.period ? ` ${timeValue.period}` : ""
                  }`
                : "—"}
            </p>
          </Demo>
        </div>
      </DemoRow>
    </DemoSection>
  );
}
