'use client';

import React, { forwardRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ForceGraph3D from 'react-force-graph-3d';

interface ForceGraphWrapperProps {
  dim?: 2 | 3;
  [key: string]: any;
}

const ForceGraphWrapper = forwardRef<any, ForceGraphWrapperProps>((props, ref) => {
  const { dim = 2, ...rest } = props;
  if (dim === 3) {
    return <ForceGraph3D {...rest} ref={ref as any} />;
  }
  return <ForceGraph2D {...rest} ref={ref as any} />;
});

ForceGraphWrapper.displayName = 'ForceGraphWrapper';
export default ForceGraphWrapper;
