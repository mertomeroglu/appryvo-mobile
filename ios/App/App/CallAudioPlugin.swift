import Foundation
import Capacitor
import AVFoundation

@objc(CallAudioPlugin)
public class CallAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CallAudioPlugin"
    public let jsName = "CallAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startCallAudioSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeakerOn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSpeakerOn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resetAudioMode", returnType: CAPPluginReturnPromise)
    ]

    private let session = AVAudioSession.sharedInstance()

    @objc func startCallAudioSession(_ call: CAPPluginCall) {
        let speakerOn = call.getBool("speakerOn") ?? false
        do {
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP])
            try session.setActive(true)
            try session.overrideOutputAudioPort(speakerOn ? .speaker : .none)
            call.resolve(["speakerOn": speakerOn])
        } catch { call.reject("Unable to configure call audio", nil, error) }
    }

    @objc func setSpeakerOn(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        do {
            // `overrideOutputAudioPort(.none)` returns routing control to iOS, preserving an
            // attached Bluetooth route instead of forcibly selecting the receiver.
            try session.overrideOutputAudioPort(enabled ? .speaker : .none)
            call.resolve(["enabled": enabled])
        } catch { call.reject("Unable to change call audio route", nil, error) }
    }

    @objc func getSpeakerOn(_ call: CAPPluginCall) {
        let enabled = session.currentRoute.outputs.contains { $0.portType == .builtInSpeaker }
        call.resolve(["enabled": enabled])
    }

    @objc func resetAudioMode(_ call: CAPPluginCall) {
        do {
            try session.overrideOutputAudioPort(.none)
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            call.resolve()
        } catch { call.reject("Unable to reset call audio", nil, error) }
    }
}
