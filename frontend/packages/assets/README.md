# @repo/assets

모노레포 공유 정적 에셋. 이미지/GIF/동영상/폰트/아이콘을 여기 두고 앱에서 import 한다.

```ts
import logo from "@repo/assets/images/logo.png";
```

`transpilePackages: ["@repo/assets"]` 를 앱의 `next.config.ts` 에 넣어야 Next.js 가 처리한다.
