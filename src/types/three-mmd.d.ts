declare module "three/examples/jsm/loaders/MMDLoader.js" {
  export class MMDLoader {
    loadWithAnimation(
      modelPath: string,
      vmdPath: string,
      onLoad: (result: any) => void
    ): void;
  }
}

declare module "three/examples/jsm/animation/MMDAnimationHelper.js" {
  export class MMDAnimationHelper {
    add(mesh: any, params: any): void;
    update(delta: number): void;
  }
}