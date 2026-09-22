import {
  Button,
  ButtonTab,
  Tab,
  TextToggle,
  ToggleSwitch,
} from "@/src/shared/ui";
import { UploadIcon } from "@/src/shared/icon";

import { Demo, DemoRow, DemoSection } from "./demo-section";

const BUTTON_COLORS = [
  "primary",
  "secondary",
  "black",
  "gray",
  "red",
  "white",
  "transparent",
] as const;

/** Button · ButtonTab · Tab · TextToggle · ToggleSwitch 전 변형 */
export function SectionActions() {
  return (
    <DemoSection title="Button / ButtonTab / Tab / TextToggle / ToggleSwitch">
      <DemoRow>
        <Demo label="filled × 7색">
          <div className="flex flex-wrap gap-2">
            {BUTTON_COLORS.map((color) => (
              <Button key={color} color={color}>
                {color}
              </Button>
            ))}
          </div>
        </Demo>
        <Demo label="outlined × 7색">
          <div className="flex flex-wrap gap-2">
            {BUTTON_COLORS.map((color) => (
              <Button key={color} variant="outlined" color={color}>
                {color}
              </Button>
            ))}
          </div>
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="size l/m/s/xs">
          <div className="flex items-center gap-2">
            <Button size="l">l</Button>
            <Button size="m">m</Button>
            <Button size="s">s</Button>
            <Button size="xs">xs</Button>
          </div>
        </Demo>
        <Demo label="iconOnly + size">
          <div className="flex items-center gap-2">
            <Button iconOnly size="l" aria-label="업로드" leftIcon={<UploadIcon />} />
            <Button iconOnly size="m" aria-label="업로드" leftIcon={<UploadIcon />} />
            <Button iconOnly size="s" aria-label="업로드" leftIcon={<UploadIcon />} />
            <Button iconOnly size="xs" aria-label="업로드" leftIcon={<UploadIcon />} />
          </div>
        </Demo>
        <Demo label="leftIcon / rightIcon">
          <div className="flex items-center gap-2">
            <Button leftIcon={<UploadIcon />}>업로드</Button>
            <Button variant="outlined" rightIcon={<UploadIcon />}>업로드</Button>
          </div>
        </Demo>
        <Demo label="disabled">
          <div className="flex items-center gap-2">
            <Button disabled>filled</Button>
            <Button disabled variant="outlined">
              outlined
            </Button>
          </div>
        </Demo>
        <Demo label="fullWidth (w-[335px])">
          <Button fullWidth className="w-[335px]">
            fullWidth
          </Button>
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="ButtonTab l · first/other/last">
          <div className="flex">
            <ButtonTab order="first" size="l">
              탭 A
            </ButtonTab>
            <ButtonTab order="other" size="l" selected>
              탭 B
            </ButtonTab>
            <ButtonTab order="last" size="l">
              탭 C
            </ButtonTab>
          </div>
        </Demo>
        <Demo label="ButtonTab m/s + leftIcon">
          <div className="flex items-center gap-2">
            <div className="flex">
              <ButtonTab order="first" size="m" leftIcon={<UploadIcon />}>
                m
              </ButtonTab>
              <ButtonTab order="last" size="m">
                m
              </ButtonTab>
            </div>
            <div className="flex">
              <ButtonTab order="first" size="s" selected>
                s
              </ButtonTab>
              <ButtonTab order="last" size="s">
                s
              </ButtonTab>
            </div>
          </div>
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="Tab (언더라인형) + leftIcon">
          <div role="tablist" className="flex">
            <Tab selected>선택됨</Tab>
            <Tab leftIcon={<UploadIcon />}>아이콘</Tab>
            <Tab>미선택</Tab>
          </div>
        </Demo>
      </DemoRow>

      <DemoRow>
        <Demo label="TextToggle oval/square × selected">
          <div className="flex flex-wrap items-center gap-2">
            <TextToggle size="l" selected>
              l on
            </TextToggle>
            <TextToggle size="l">l off</TextToggle>
            <TextToggle shape="square" size="m" selected>
              m on
            </TextToggle>
            <TextToggle shape="square" size="m">
              m off
            </TextToggle>
            <TextToggle size="s" selected>
              s on
            </TextToggle>
            <TextToggle shape="square" size="s">
              s off
            </TextToggle>
          </div>
        </Demo>
        <Demo label="TextToggle leftIcon">
          <TextToggle selected leftIcon={<UploadIcon />}>
            아이콘
          </TextToggle>
        </Demo>
        <Demo label="ToggleSwitch on/off × size">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <ToggleSwitch size="l" defaultChecked aria-label="l on" />
              <ToggleSwitch size="l" aria-label="l off" />
            </div>
            <div className="flex items-center gap-1.5">
              <ToggleSwitch size="m" defaultChecked aria-label="m on" />
              <ToggleSwitch size="m" aria-label="m off" />
            </div>
            <div className="flex items-center gap-1.5">
              <ToggleSwitch size="s" defaultChecked aria-label="s on" />
              <ToggleSwitch size="s" aria-label="s off" />
            </div>
          </div>
        </Demo>
        <Demo label="ToggleSwitch disabled">
          <div className="flex items-center gap-1.5">
            <ToggleSwitch defaultChecked disabled aria-label="disabled on" />
            <ToggleSwitch disabled aria-label="disabled off" />
          </div>
        </Demo>
      </DemoRow>
    </DemoSection>
  );
}
