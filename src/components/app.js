/**
 * Copyright (c) 2020, RTE (http://www.rte-france.com)
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useCallback, useEffect, useState } from 'react';

import { useDispatch, useSelector } from 'react-redux';

import {
    Redirect,
    Route,
    Switch,
    useHistory,
    useLocation,
} from 'react-router-dom';

import {
    selectComputedLanguage,
    selectLanguage,
    selectTheme,
} from '../redux/actions';

import {
    AuthenticationRouter,
    getPreLoginPath,
    initializeAuthenticationProd,
    initializeAuthenticationDev,
} from '@gridsuite/commons-ui';

import { useRouteMatch } from 'react-router-dom';
import { FormattedMessage } from 'react-intl';
import Typography from '@material-ui/core/Typography';
import Box from '@material-ui/core/Box';

import {
    connectNotificationsWsUpdateConfig,
    fetchConfigParameter,
    fetchConfigParameters,
} from '../utils/rest-api';
import {
    APP_NAME,
    COMMON_APP_NAME,
    PARAM_LANGUAGE,
    PARAM_THEME,
} from '../utils/config-params';
import { getComputedLanguage } from '../utils/language';
import { displayErrorMessageWithSnackbar, useIntlRef } from '../utils/messages';
import { useSnackbar } from 'notistack';
import AppTopBar from './app-top-bar';

const noUserManager = { instance: null, error: null };

const App = () => {
    const intlRef = useIntlRef();

    const { enqueueSnackbar } = useSnackbar();

    const user = useSelector((state) => state.user);

    const signInCallbackError = useSelector(
        (state) => state.signInCallbackError
    );

    const [userManager, setUserManager] = useState(noUserManager);

    const history = useHistory();

    const dispatch = useDispatch();

    const location = useLocation();

    const updateParams = useCallback(
        (params) => {
            console.debug('received UI parameters : ', params);
            params.forEach((param) => {
                switch (param.name) {
                    case PARAM_THEME:
                        dispatch(selectTheme(param.value));
                        break;
                    case PARAM_LANGUAGE:
                        dispatch(selectLanguage(param.value));
                        dispatch(
                            selectComputedLanguage(
                                getComputedLanguage(param.value)
                            )
                        );
                        break;
                    default:
                }
            });
        },
        [dispatch]
    );

    const connectNotificationsUpdateConfig = useCallback(() => {
        const ws = connectNotificationsWsUpdateConfig();

        ws.onmessage = function (event) {
            let eventData = JSON.parse(event.data);
            if (eventData.headers && eventData.headers['parameterName']) {
                fetchConfigParameter(eventData.headers['parameterName'])
                    .then((param) => updateParams([param]))
                    .catch((errorMessage) =>
                        displayErrorMessageWithSnackbar({
                            errorMessage: errorMessage,
                            enqueueSnackbar: enqueueSnackbar,
                            headerMessage: {
                                headerMessageId: 'paramsRetrievingError',
                                intlRef: intlRef,
                            },
                        })
                    );
            }
        };
        ws.onerror = function (event) {
            console.error('Unexpected Notification WebSocket error', event);
        };
        return ws;
    }, [updateParams, enqueueSnackbar, intlRef]);

    // Can't use lazy initializer because useRouteMatch is a hook
    const [initialMatchSilentRenewCallbackUrl] = useState(
        useRouteMatch({
            path: '/silent-renew-callback',
            exact: true,
        })
    );

    const initialize = useCallback(() => {
        if (process.env.REACT_APP_USE_AUTHENTICATION === 'true') {
            return initializeAuthenticationProd(
                dispatch,
                initialMatchSilentRenewCallbackUrl != null,
                fetch('idpSettings.json')
            );
        } else {
            return initializeAuthenticationDev(
                dispatch,
                initialMatchSilentRenewCallbackUrl != null
            );
        }
        // Note: initialMatchSilentRenewCallbackUrl and dispatch don't change
    }, [initialMatchSilentRenewCallbackUrl, dispatch]);

    useEffect(() => {
        initialize()
            .then((userManager) => {
                setUserManager({ instance: userManager, error: null });
                userManager.getUser().then((user) => {
                    if (
                        user == null &&
                        initialMatchSilentRenewCallbackUrl == null
                    ) {
                        userManager.signinSilent().catch((error) => {
                            const oidcHackReloaded =
                                'gridsuite-oidc-hack-reloaded';
                            if (
                                !sessionStorage.getItem(oidcHackReloaded) &&
                                error.message ===
                                    'authority mismatch on settings vs. signin state'
                            ) {
                                sessionStorage.setItem(oidcHackReloaded, true);
                                console.log(
                                    'Hack oidc, reload page to make login work'
                                );
                                window.location.reload();
                            }
                        });
                    }
                });
            })
            .catch(function (error) {
                setUserManager({ instance: null, error: error.message });
                console.debug('error when importing the idp settings');
            });
        // Note: initialize and initialMatchSilentRenewCallbackUrl won't change
    }, [initialize, initialMatchSilentRenewCallbackUrl]);

    useEffect(() => {
        if (user !== null) {
            fetchConfigParameters(COMMON_APP_NAME)
                .then((params) => updateParams(params))
                .catch((errorMessage) =>
                    displayErrorMessageWithSnackbar({
                        errorMessage: errorMessage,
                        enqueueSnackbar: enqueueSnackbar,
                        headerMessage: {
                            headerMessageId: 'paramsRetrievingError',
                            intlRef: intlRef,
                        },
                    })
                );

            fetchConfigParameters(APP_NAME)
                .then((params) => updateParams(params))
                .catch((errorMessage) =>
                    displayErrorMessageWithSnackbar({
                        errorMessage: errorMessage,
                        enqueueSnackbar: enqueueSnackbar,
                        headerMessage: {
                            headerMessageId: 'paramsRetrievingError',
                            intlRef: intlRef,
                        },
                    })
                );

            const ws = connectNotificationsUpdateConfig();
            return function () {
                ws.close();
            };
        }
    }, [
        user,
        dispatch,
        updateParams,
        enqueueSnackbar,
        intlRef,
        connectNotificationsUpdateConfig,
    ]);

    return (
        <>
            <AppTopBar user={user} userManager={userManager} />
            {user !== null ? (
                <Switch>
                    <Route exact path="/">
                        <Box mt={20}>
                            <Typography
                                variant="h3"
                                color="textPrimary"
                                align="center"
                            >
                                Connected
                            </Typography>
                        </Box>
                    </Route>
                    <Route exact path="/sign-in-callback">
                        <Redirect to={getPreLoginPath() || '/'} />
                    </Route>
                    <Route exact path="/logout-callback">
                        <h1>Error: logout failed; you are still logged in.</h1>
                    </Route>
                    <Route>
                        <h1>
                            <FormattedMessage id="PageNotFound" />
                        </h1>
                    </Route>
                </Switch>
            ) : (
                <AuthenticationRouter
                    userManager={userManager}
                    signInCallbackError={signInCallbackError}
                    dispatch={dispatch}
                    history={history}
                    location={location}
                />
            )}
        </>
    );
};

export default App;
