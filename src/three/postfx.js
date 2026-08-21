import { Vector2 } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Bloom seletivo por limiar (UnrealBloomPass).
 *
 * Escolhido em vez de escrever um blur próprio porque já vem no three
 * (`three/addons`) — nenhuma dependência nova — e porque o downsample em
 * mip chain dele é o que dá o brilho "caro" sem custo proporcional à
 * resolução da tela.
 *
 * Só é instanciado no tier alto, sempre com os render targets em resolução
 * reduzida (`scale`), e o experience descarta a instância inteira ao primeiro
 * sinal de queda de framerate.
 */
export class PostFX {
  constructor(renderer, scene, camera, {
    strength = 0.72, radius = 0.62, threshold = 0.62, scale = 0.5,
  } = {}) {
    this.renderer = renderer;
    this.scale = scale;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(new Vector2(1, 1), strength, radius, threshold);
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());
  }

  setSize(width, height, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.bloom.setSize(
      Math.max(1, Math.floor(width * this.scale)),
      Math.max(1, Math.floor(height * this.scale))
    );
  }

  setStrength(v) { this.bloom.strength = v; }

  render() { this.composer.render(); }

  dispose() {
    this.bloom.dispose?.();
    this.composer.renderTarget1?.dispose();
    this.composer.renderTarget2?.dispose();
    this.composer.passes.length = 0;
  }
}
