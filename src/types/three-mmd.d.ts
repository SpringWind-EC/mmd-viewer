declare module "three/examples/jsm/loaders/MMDLoader.js" {
  export class MMDLoader {
    loadAnimation(
      url: string | string[],
      object: any,
      onLoad: (animation: any) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent | Error) => void
    ): void;

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
    createGrantSolver(mesh: any): any;
    update(delta: number): void;
  }
}
