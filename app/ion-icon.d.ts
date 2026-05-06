import React from 'react';

declare global {
    namespace JSX {
        interface IntrinsicElements {
            'ion-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                name?: string;
                size?: string;
                color?: string;
                class?: string;
                slot?: string;
                suppressHydrationWarning?: boolean;
            };
        }
    }
}

// Support for older React versions or different resolutions
declare namespace React {
    namespace JSX {
        interface IntrinsicElements {
            'ion-icon': any;
        }
    }
}
