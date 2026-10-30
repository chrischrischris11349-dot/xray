/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import {
    Divider,
    Span,
} from "@components/index";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Checkbox, closeModal, Modal, openModal, Text, } from "@webpack/common";

import managedStyle from "./styles.css?managed";
import { boundedCaptureOptions,captureAudioOptions,gamingSharePreset } from "./captureConstraints";
import { confirmSharePreview } from "./sharePreview";

const cl = classNameFactory("vc-screen-picker-");

class NotAllowedError extends Error {
    name = "NotAllowedError";
}

const logger = new Logger("VencordScreenShare");

const getDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);

function openScreenSharePicker(options: DisplayMediaStreamOptions) {
    return new Promise<MediaStream>((resolve, reject) => {
        const key = openModal(
            props => (
                <ModalComponent
                    modalProps={props}
                    submit={resolve}
                    options={options}
                    close={() => {
                        props.onClose();
                        reject(new NotAllowedError("Permission denied by user"));
                    }}
                />
            ),
            {
                onCloseRequest() {
                    closeModal(key);
                    reject(new NotAllowedError("Permission denied by user"));
                },
                onCloseCallback() {
                    reject(new NotAllowedError("Permission denied by user"));
                }
            }
        );
    });
}

function OptionRadio<Settings extends object, Key extends keyof Settings, Options extends ReadonlyArray<string>>(props: {
    options: Options;
    labels?: Array<string>;
    settings: Settings;
    settingsKey: Key;
    onChange: (option: Options[number]) => void;
}) {
    const { options, settings, settingsKey, labels, onChange } = props;

    return (
        <div className={cl("padding")}>
            <div className={cl("option-radios")}>
                {options.map((option, idx) => (
                    <label className={cl("option-radio")} data-checked={settings[settingsKey] === option} key={option}>
                        <Span weight="bold">{labels?.[idx] ?? option}</Span>
                        <input
                            type="radio"
                            name={settingsKey.toString()}
                            value={option}
                            checked={settings[settingsKey] === option}
                            onChange={() => onChange(option)}
                        />
                    </label>
                ))}
            </div>
        </div>
    );
}

function ModalComponent({ modalProps, submit, close, options }: {
    modalProps: any;
    submit: (data: Promise<MediaStream>) => void;
    close: () => void;
    options: DisplayMediaStreamOptions;
}) {
    const liveSettings = settings.use();
    const disableStreamPreviewsValue = disableStreamPreviews.useSetting();

    async function stream() {
        try {
            const frameRate = Number(liveSettings.frameRate);
            const height = Number(liveSettings.resolution);

            // const conn = [...MediaEngineStore.getMediaEngine().connections].find(
            //     connection => connection.userId === UserStore.getCurrentUser().id
            // );

            const videoOptions = typeof options?.video !== "boolean" && !!options.video ? options.video : {};
            const audioOptions = typeof options?.audio !== "boolean" && !!options.audio ? options.audio : {};
            // Limit capture work to the selected budget, while preserving stricter
            // caller constraints. Discord retains its negotiated encoding/bitrate limits.
            const capture = () => getDisplayMedia(boundedCaptureOptions(captureAudioOptions({
                    ...options,
                    video: options.video === false ? false : { ...videoOptions },
                    audio: options.audio === false ? false : {
                        ...audioOptions,
                        restrictOwnAudio: true,
                    },
                    surfaceSwitching: "include",
                    systemAudio: liveSettings.systemAudio ? "exclude" : "include"
                }, liveSettings.systemAudio?"off":liveSettings.audioMode??"default"), frameRate, height)).then(t => {
                    // w3c says this can fail, they don't say why, so just to be safe
                    try {
                        const video = t.getVideoTracks()?.[0];
                        if (video) video.contentHint = liveSettings.contentHint;
                    } catch { }
                    return t;
                });
            submit(capture().then(media => confirmSharePreview(media, capture)));
        } catch (error) {
            logger.error("Error while submitting stream.", error);
            submit(Promise.reject(error));
        } finally {
            close();
        }
    }

    return (
        <div className={cl("modal")}>
            <Modal
                {...modalProps}

                size="lg"
                actionBarInput={
                    <div className={cl("summary")}>
                        <Text variant="text-md/semibold" color="text-strong" className={cl("source-or-preset-name")}>{liveSettings.contentHint === "motion" ? "Gaming" : liveSettings.contentHint === "detail" ? "Screenshare" : "Custom"}</Text>
                        <Text variant="text-xs/medium" color="text-muted" className={cl("summary-detail")}>
                            <span>{liveSettings.contentHint === "motion" ? "Smoother video" : liveSettings.contentHint === "detail" ? "Cleaner text" : "User preset"}</span>
                            <span className={cl("ellipsis")}>•</span>
                            <span>{liveSettings.resolution}p</span>
                            <span className={cl("ellipsis")}>•</span>
                            <span>{liveSettings.frameRate}fps</span>
                            {liveSettings.systemAudio ? <span className={cl("ellipsis")}>•</span> : ""}
                            {liveSettings.systemAudio ? <span>Stream Muted</span> : ""}
                        </Text>
                    </div>
                }
                actions={[
                    {
                        variant: "primary",
                        text: "Choose source",
                        onClick: stream
                    }
                ]}
            >

                <div>
                    <section className={cl("padding")}>
                        <Text tag="h2" variant="heading-md/semibold" color="text-strong">Gaming presets</Text>
                        <OptionRadio options={["low-impact","smooth"] as const} labels={["Lower game impact · 720p / 30fps","Smoother stream · 720p / 60fps"]} settings={{preset:liveSettings.resolution==="720"&&liveSettings.contentHint==="motion"?(liveSettings.frameRate==="30"?"low-impact":liveSettings.frameRate==="60"?"smooth":""):""}} settingsKey="preset" onChange={value=>Object.assign(liveSettings,gamingSharePreset(value))} />
                        <Text variant="text-sm/normal" color="text-subtle">Lower game impact reduces capture and encoding work at the cost of stream resolution and frame rate. Choose an application window when practical. Compare game FPS at the same stream settings.</Text>
                    </section>
                    <div className={cl("flex", "padding")}>
                        <section className={cl("quality-section")}>
                            <Text tag="h2" variant="heading-md/semibold" color="text-strong">Resolution</Text>
                            <OptionRadio
                                options={StreamResolution}
                                settings={liveSettings}
                                settingsKey="resolution"
                                onChange={value => (liveSettings.resolution = value)}
                            />
                        </section>

                        <section className={cl("quality-section")}>
                            <Text tag="h2" variant="heading-md/semibold" color="text-strong">Frame Rate</Text>
                            <OptionRadio
                                options={StreamFps}
                                settings={liveSettings}
                                settingsKey="frameRate"
                                onChange={value => (liveSettings.frameRate = value)}
                            />
                        </section>
                    </div>
                    <div>
                        <Text tag="h2" variant="heading-md/semibold" color="text-strong">Stream Mode</Text>
                        <div>
                            <OptionRadio
                                options={StreamContentHint}
                                labels={["Smoother video", "Cleaner text", "Custom"]}
                                settings={liveSettings}
                                settingsKey="contentHint"
                                onChange={option => (liveSettings.contentHint = option)}
                            />
                        </div>
                    </div>
                    <Divider />
                    <section className={cl("padding")}>
                        <Text tag="h2" variant="heading-md/semibold" color="text-strong">Share audio</Text>
                        <OptionRadio options={StreamAudio} labels={["Application audio", "System audio", "No audio", "Discord default"]} settings={{...liveSettings,audioMode:liveSettings.systemAudio?"off":liveSettings.audioMode??"default"}} settingsKey="audioMode" onChange={value=>{liveSettings.audioMode=value;liveSettings.systemAudio=value==="off";}} />
                        <Text variant="text-sm/normal" color="text-subtle">Application audio avoids the desktop mix when Windows supports it. Your microphone is never added. System audio can include VoiceMeeter monitoring or any other sound routed to your output; use application audio or disable that monitoring route to exclude it. The next preview reports whether an audio track was actually supplied.</Text>
                    </section>
                    <div className={cl("padding", "pointer")}>
                        <Checkbox
                            value={!disableStreamPreviewsValue}
                            onChange={(_e, value) => disableStreamPreviews.updateSetting(() => !value)}
                            shape="box"
                            reverse={true}>
                            <div className={cl("control-content")}>
                                <Text tag="h2" variant="heading-md/semibold" color="text-strong">Show Stream Previews</Text>
                                <Text variant="text-sm/normal" color="text-subtle">Allows others to see a preview of your stream before they join.</Text>
                            </div>
                        </Checkbox>
                    </div>
                    <Divider />
                    <Text variant="text-sm/normal" color="text-subtle">
                        Capture is capped at your selection; Discord's stream quality, account limits,
                        available hardware and upload bandwidth still determine what viewers receive.
                        If game FPS drops while sharing, start with 720p at 30fps.
                        Choose 720p at 60fps when you have more headroom and want smoother motion.
                    </Text>
                </div>
            </Modal>
        </div>
    );
}

// Capture budgets; these do not replace Discord's negotiated encoder settings.
const StreamAudio = ["application","system","off","default"] as const;
const StreamResolution = ["480", "720", "1080", "1440", "2160"] as const;
const StreamFps = ["15", "30", "60", "120"] as const;
const StreamContentHint = ["motion", "detail", ""] as const;

const settings = definePluginSettings({
    audioMode:{type:OptionType.SELECT,description:"Screen-share audio source",hidden:true,options:StreamAudio.map(value=>({label:value,value,default:value==="application"}))},
    resolution: {
        type: OptionType.SELECT,
        description: "Resolution",
        hidden: true,
        options: StreamResolution.map(res => ({ label: res, value: res, default: res === "1080" }))
    },
    frameRate: {
        type: OptionType.SELECT,
        description: "Frame Rate",
        hidden: true,
        options: StreamFps.map(fps => ({ label: fps, value: fps, default: fps === "60" }))
    },
    contentHint: {
        type: OptionType.SELECT,
        description: "Content Hint",
        hidden: true,
        options: StreamContentHint.map(hint => ({ label: hint, value: hint, default: hint === "motion" }))
    },
    systemAudio: {
        type: OptionType.BOOLEAN,
        description: "Mute system audio",
        hidden: true
    }
});

const disableStreamPreviews = getUserSettingLazy<boolean>("voiceAndVideo", "disableStreamPreviews")!;

export default definePlugin({
    name: "WebScreenShare",
    authors: [Devs.ThaUnknown],
    description: "Adds a screenshare options menu. Allows for changing resolution, framerate, encoding hints, and system audio settings.",
    tags: ["Voice", "Utility"],
    enabledByDefault: true,
    settings,
    managedStyle,

    start() {
        navigator.mediaDevices.getDisplayMedia = openScreenSharePicker;
    },
    stop() {
        navigator.mediaDevices.getDisplayMedia = getDisplayMedia;
    }
});
