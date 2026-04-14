'use client';

import Error from '@/app/error';
import React from 'react';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class RootErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('RootErrorBoundary caught:', error);
        console.error('Error info:', errorInfo);
    }

    render() {
        if (this.state.hasError && this.state.error) {
            return (
                <Error 
                    error={this.state.error} 
                    reset={() => this.setState({ hasError: false, error: null })} 
                />
            );
        }

        return this.props.children;
    }
}
