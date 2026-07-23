import Foundation
import UIKit
import Combine
import GroupActivities
import Capacitor

@available(iOS 15.0, *)
public struct ThroupleWatchActivity: GroupActivity, Codable, Sendable {
    public static let activityIdentifier = "com.throupletea.app.watch-party"

    public let videoId: String
    public let title: String
    public let kind: String
    public let thumbnail: String?

    public init(videoId: String, title: String, kind: String, thumbnail: String?) {
        self.videoId = videoId
        self.title = title
        self.kind = kind
        self.thumbnail = thumbnail
    }

    public var metadata: GroupActivityMetadata {
        var metadata = GroupActivityMetadata()
        metadata.type = .watchTogether
        metadata.title = title
        metadata.subtitle = "Throuple Tea Watch Party"
        metadata.fallbackURL = URL(string: "https://throupletea.com")
        return metadata
    }
}

@available(iOS 15.0, *)
public struct ThroupleWatchMessage: Codable, Sendable {
    public let type: String
    public let action: String?
    public let position: Double?
    public let playing: Bool?
    public let sentAt: Double?
    public let reaction: String?
    public let messageId: String

    public init(
        type: String,
        action: String?,
        position: Double?,
        playing: Bool?,
        sentAt: Double?,
        reaction: String?,
        messageId: String
    ) {
        self.type = type
        self.action = action
        self.position = position
        self.playing = playing
        self.sentAt = sentAt
        self.reaction = reaction
        self.messageId = messageId
    }

    public var dictionary: [String: Any] {
        var result: [String: Any] = [
            "type": type,
            "messageId": messageId
        ]
        if let action { result["action"] = action }
        if let position { result["position"] = position }
        if let playing { result["playing"] = playing }
        if let sentAt { result["sentAt"] = sentAt }
        if let reaction { result["reaction"] = reaction }
        return result
    }
}

@objc(ThroupleWatchPartyPlugin)
public class ThroupleWatchPartyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ThroupleWatchPartyPlugin"
    public let jsName = "ThroupleWatchParty"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "leave", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendMessage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise)
    ]

    private var observerTask: Task<Void, Never>?
    private var messageTask: Task<Void, Never>?
    private var groupSession: Any?
    private var messenger: Any?
    private var cancellables = Set<AnyCancellable>()
    private var activeActivity: Any?
    private var participantCount = 1

    public override func load() {
        guard #available(iOS 15.0, *) else { return }
        observerTask = Task { [weak self] in
            await self?.observeSessions()
        }
    }

    deinit {
        observerTask?.cancel()
        messageTask?.cancel()
        cancellables.removeAll()
    }

    @objc public func isAvailable(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve([
                "available": false,
                "reason": "SharePlay requires iOS 15 or later."
            ])
            return
        }
        call.resolve(["available": true])
    }

    @objc public func start(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.reject("SharePlay requires iOS 15 or later.")
            return
        }

        guard
            let videoId = call.getString("videoId"),
            let title = call.getString("title"),
            let kind = call.getString("kind")
        else {
            call.reject("videoId, title and kind are required.")
            return
        }

        let activity = ThroupleWatchActivity(
            videoId: videoId,
            title: title,
            kind: kind,
            thumbnail: call.getString("thumbnail")
        )

        Task { @MainActor [weak self] in
            guard let self else {
                call.reject("Watch Party is unavailable.")
                return
            }

            do {
                if #available(iOS 15.4, *) {
                    let controller = try GroupActivitySharingController(activity)
                    guard let presenter = self.bridge?.viewController else {
                        call.reject("Unable to present the SharePlay invitation.")
                        return
                    }

                    if let presented = presenter.presentedViewController {
                        presented.dismiss(animated: false)
                    }

                    presenter.present(controller, animated: true) {
                        call.resolve(["presented": true])
                    }
                } else {
                    let activated = try await activity.activate()
                    call.resolve([
                        "presented": activated,
                        "directActivation": true
                    ])
                }
            } catch {
                call.reject(
                    "Unable to start the Watch Party.",
                    nil,
                    error
                )
            }
        }
    }

    @objc public func leave(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve()
            return
        }

        if let session = groupSession as? GroupSession<ThroupleWatchActivity> {
            session.leave()
        }
        clearSession(notify: true)
        call.resolve()
    }

    @objc public func sendMessage(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.reject("SharePlay is unavailable.")
            return
        }
        guard let messenger = messenger as? GroupSessionMessenger else {
            call.reject("There is no active Watch Party.")
            return
        }

        let message = ThroupleWatchMessage(
            type: call.getString("type") ?? "playback",
            action: call.getString("action"),
            position: call.getDouble("position"),
            playing: call.getBool("playing"),
            sentAt: call.getDouble("sentAt"),
            reaction: call.getString("reaction"),
            messageId: call.getString("messageId") ?? UUID().uuidString
        )

        Task {
            do {
                try await messenger.send(message)
                call.resolve()
            } catch {
                call.reject("Unable to sync the Watch Party.", nil, error)
            }
        }
    }

    @objc public func getState(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve([
                "active": false,
                "participants": 1
            ])
            return
        }

        if let activity = activeActivity as? ThroupleWatchActivity {
            call.resolve([
                "active": groupSession != nil,
                "participants": participantCount,
                "videoId": activity.videoId,
                "title": activity.title,
                "kind": activity.kind,
                "thumbnail": activity.thumbnail as Any
            ])
        } else {
            call.resolve([
                "active": false,
                "participants": 1
            ])
        }
    }

    @available(iOS 15.0, *)
    private func observeSessions() async {
        for await session in ThroupleWatchActivity.sessions() {
            if Task.isCancelled { return }
            await configure(session)
        }
    }

    @available(iOS 15.0, *)
    @MainActor
    private func configure(_ session: GroupSession<ThroupleWatchActivity>) {
        clearSession(notify: false)

        groupSession = session
        activeActivity = session.activity
        participantCount = session.activeParticipants.count
        let newMessenger = GroupSessionMessenger(session: session)
        messenger = newMessenger

        session.$activeParticipants
            .receive(on: DispatchQueue.main)
            .sink { [weak self] participants in
                guard let self else { return }
                self.participantCount = participants.count
                self.notifyListeners("participantsChanged", data: [
                    "participants": participants.count
                ])
            }
            .store(in: &cancellables)

        session.$state
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                guard let self else { return }
                switch state {
                case .invalidated:
                    self.clearSession(notify: true)
                default:
                    break
                }
            }
            .store(in: &cancellables)

        messageTask = Task { [weak self] in
            for await (message, context) in newMessenger.messages(of: ThroupleWatchMessage.self) {
                if Task.isCancelled { return }
                var payload = message.dictionary
                payload["senderId"] = context.source.id.uuidString
                await MainActor.run {
                    self?.notifyListeners("partyMessage", data: payload)
                }
            }
        }

        session.join()

        notifyListeners("sessionStarted", data: [
            "active": true,
            "participants": participantCount,
            "videoId": session.activity.videoId,
            "title": session.activity.title,
            "kind": session.activity.kind,
            "thumbnail": session.activity.thumbnail as Any
        ])
    }

    private func clearSession(notify: Bool) {
        messageTask?.cancel()
        messageTask = nil
        cancellables.removeAll()
        groupSession = nil
        messenger = nil
        activeActivity = nil
        participantCount = 1

        if notify {
            notifyListeners("sessionEnded", data: [
                "active": false,
                "participants": 1
            ])
        }
    }
}
