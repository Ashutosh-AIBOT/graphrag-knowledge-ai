'use client';

import React from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ForceGraph3D from 'react-force-graph-3d';

interface ForceGraphWrapperProps {
  dim?: 2 | 3;
  fgRef?: React.RefObject<any>;
  [key: string]: any;
}

export default function ForceGraphWrapper({ dim = 2, fgRef, ...rest }: ForceGraphWrapperProps) {
  if (dim === 3) {
    return <ForceGraph3D {...rest} ref={fgRef} />;
  }
  return <ForceGraph2D {...rest} ref={fgRef} />;
}
