// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ConfigurationTarget, EventEmitter } from 'vscode';
import { arePathsSame } from './common/platform/fs-paths';
import { IExtensions, IInterpreterPathService, Resource } from './common/types';
import {
    EnvironmentsChangedParams,
    ActiveEnvironmentChangedParams,
    EnvironmentDetailsOptions,
    EnvironmentDetails,
    DeprecatedProposedAPI,
} from './deprecatedProposedApiTypes';
import { IInterpreterService } from './interpreter/contracts';
import { IServiceContainer } from './ioc/types';
import { traceVerbose } from './logging';
import { PythonEnvInfo } from './pythonEnvironments/base/info';
import { getEnvPath } from './pythonEnvironments/base/info/env';
import { GetRefreshEnvironmentsOptions, IDiscoveryAPI } from './pythonEnvironments/base/locator';
import { sendTelemetryEvent } from './telemetry';
import { EventName } from './telemetry/constants';

const onDidInterpretersChangedEvent = new EventEmitter<EnvironmentsChangedParams[]>();
/**
 * @deprecated Will be removed soon.
 */
export function reportInterpretersChanged(e: EnvironmentsChangedParams[]): void {
    onDidInterpretersChangedEvent.fire(e);
}

const onDidActiveInterpreterChangedEvent = new EventEmitter<ActiveEnvironmentChangedParams>();
/**
 * @deprecated Will be removed soon.
 */
export function reportActiveInterpreterChangedDeprecated(e: ActiveEnvironmentChangedParams): void {
    onDidActiveInterpreterChangedEvent.fire(e);
}

function getVersionString(env: PythonEnvInfo): string[] {
    const ver = [`${env.version.major}`, `${env.version.minor}`, `${env.version.micro}`];
    if (env.version.release) {
        ver.push(`${env.version.release}`);
        if (env.version.sysVersion) {
            ver.push(`${env.version.release}`);
        }
    }
    return ver;
}

/**
 * Returns whether the path provided matches the environment.
 * @param path Path to environment folder or path to interpreter that uniquely identifies an environment.
 * @param env Environment to match with.
 */
function isEnvSame(path: string, env: PythonEnvInfo) {
    return arePathsSame(path, env.location) || arePathsSame(path, env.executable.filename);
}

export function buildDeprecatedProposedApi(
    discoveryApi: IDiscoveryAPI,
    serviceContainer: IServiceContainer,
): DeprecatedProposedAPI {
    const interpreterPathService = serviceContainer.get<IInterpreterPathService>(IInterpreterPathService);
    const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
    const extensions = serviceContainer.get<IExtensions>(IExtensions);
    function sendApiTelemetry(apiName: string, warnLog = true) {
        if (warnLog) {
            console.warn('Extension is using deprecated python APIs which will be removed soon');
        }
        extensions
            .determineExtensionFromCallStack()
            .then((info) => {
                sendTelemetryEvent(EventName.PYTHON_ENVIRONMENTS_API, undefined, {
                    apiName,
                    extensionId: info.extensionId,
                });
                traceVerbose(`Extension ${info.extensionId} accessed ${apiName}`);
            })
            .ignoreErrors();
    }

    const proposed: DeprecatedProposedAPI = {
        environment: {
            async getExecutionDetails(resource?: Resource) {
                sendApiTelemetry('getExecutionDetails');
                const env = await interpreterService.getActiveInterpreter(resource);
                return env ? { execCommand: [env.path] } : { execCommand: undefined };
            },
            async getEnvironmentDetails(
                path: string,
                options?: EnvironmentDetailsOptions,
            ): Promise<EnvironmentDetails | undefined> {
                sendApiTelemetry('getEnvironmentDetails');
                let env: PythonEnvInfo | undefined;
                if (options?.useCache) {
                    env = discoveryApi.getEnvs().find((v) => isEnvSame(path, v));
                }
                if (!env) {
                    env = await discoveryApi.resolveEnv(path);
                    if (!env) {
                        return undefined;
                    }
                }
                return {
                    interpreterPath: env.executable.filename,
                    envFolderPath: env.location.length ? env.location : undefined,
                    version: getVersionString(env),
                    environmentType: [env.kind],
                    metadata: {
                        sysPrefix: env.executable.sysPrefix,
                        bitness: env.arch,
                        project: env.searchLocation,
                    },
                };
            },
            getEnvironmentPaths() {
                sendApiTelemetry('getEnvironmentPaths');
                const paths = discoveryApi.getEnvs().map((e) => getEnvPath(e.executable.filename, e.location));
                return Promise.resolve(paths);
            },
            setActiveEnvironment(path: string, resource?: Resource): Promise<void> {
                sendApiTelemetry('setActiveEnvironment');
                return interpreterPathService.update(resource, ConfigurationTarget.WorkspaceFolder, path);
            },
            async refreshEnvironment() {
                sendApiTelemetry('refreshEnvironment');
                await discoveryApi.triggerRefresh();
                const paths = discoveryApi.getEnvs().map((e) => getEnvPath(e.executable.filename, e.location));
                return Promise.resolve(paths);
            },
            getRefreshPromise(options?: GetRefreshEnvironmentsOptions): Promise<void> | undefined {
                sendApiTelemetry('getRefreshPromise');
                return discoveryApi.getRefreshPromise(options);
            },
            get onDidChangeExecutionDetails() {
                sendApiTelemetry('onDidChangeExecutionDetails', false);
                return interpreterService.onDidChangeInterpreterConfiguration;
            },
            get onDidEnvironmentsChanged() {
                sendApiTelemetry('onDidEnvironmentsChanged', false);
                return onDidInterpretersChangedEvent.event;
            },
            get onDidActiveEnvironmentChanged() {
                sendApiTelemetry('onDidActiveEnvironmentChanged', false);
                return onDidActiveInterpreterChangedEvent.event;
            },
            get onRefreshProgress() {
                sendApiTelemetry('onRefreshProgress', false);
                return discoveryApi.onProgress;
            },
        },
    };
    return proposed;
}