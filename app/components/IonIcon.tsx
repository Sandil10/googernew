// @ts-nocheck
"use client";

import { useState, useEffect } from "react";

// Wrapper component for ion-icon to suppress hydration warnings
// and ensure it only renders on the client to avoid hydration errors
interface IonIconProps {
    name: string;
    size?: string;
    className?: string;
}

export default function IonIcon({ name, size, className }: IonIconProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <div
                className={className}
                style={{
                    width: size || '1em',
                    height: size || '1em',
                    display: 'inline-block'
                }}
            />
        );
    }

    // Double-check custom elements support for extreme mobile stability
    if (typeof customElements === 'undefined') {
        return <div className={className} style={{ width: size || '1em', height: size || '1em' }} />;
    }

    return (
        <ion-icon
            name={name}
            size={size}
            className={className}
        ></ion-icon>
    );
}
