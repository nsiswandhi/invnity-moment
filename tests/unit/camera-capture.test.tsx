import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CameraCapture, type CameraCaptureProps } from '../../components/camera/CameraCapture';

describe('CameraCapture', () => {
  it('shows the participant active-moment count alongside their quota', () => {
    const props = {
      activeMoments: 2,
      maxActiveMoments: 10,
      onCapture: () => undefined,
      onPermissionState: () => undefined,
    } as unknown as CameraCaptureProps;

    expect(renderToStaticMarkup(<CameraCapture {...props} />)).toContain('2 / 10');
  });
});
