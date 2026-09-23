import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { CallProvider } from "../components/context/CallContext.jsx";
import Homepage from "../pages/Home/Home.jsx";
import Explore from "../pages/Explore/Explore.jsx";
import Profilepage from "../pages/Profile/Profile.jsx";
import EditProfile from "../pages/Profile/EditProfile.jsx";
import BlockedAccounts from "../pages/Settings/blocked.jsx";
import ChangePassword from "../pages/Settings/changepassword.jsx";
import DeleteAccount from "../pages/Settings/deleteaccount.jsx";
import NotificationSettings from "../pages/Settings/notification.jsx";
import PrivacyToggle from "../pages/Settings/privacy.jsx";
import Settings from "../pages/Settings/settings.jsx";
import Post from "../components/PostCard/post.jsx";
import CreateTextPost from "../components/PostCard/createtextpost.jsx";
import CreateImagePost from "../components/PostCard/addimagepost.jsx";
import EditImagePage from "../components/PostCard/editpost.jsx";
import CreateVideoPost from "../components/PostCard/videopostformat.jsx";
import ActivityPage from "../pages/notifications/activitypage.jsx";
import Messages from "../pages/Messages/messages.jsx";
import VideoPage from "../pages/videopage/videopage.jsx";
import AuthPage from "../App.jsx";
import Loginform from "../authentication/login/login.jsx";
import RegisterForm from "../authentication/register new user/registeruser.jsx";
import EmailVerifyPage from "../authentication/register new user/emailverificationpage.jsx";
import OtpVerifyPage from "../authentication/register new user/otpverificationpage.jsx";
import SavedPage from "../pages/savedpage/savedposts.jsx";
import ForgotPassword from "../authentication/login/forgotpassword.jsx";
import OtpVerify from "../authentication/login/forgotpasswordotp.jsx";
import ResetPassword from "../authentication/login/resetpassword.jsx";
import Reelspage from "../components/PostCard/reelspage.jsx";
import Videopost from "../components/PostCard/video.jsx";
import TextPostView from "../components/PostCard/TextPostView.jsx";
import UserProfileView from "../pages/Profile/UserProfileView.jsx";
import StoryViewer from "../components/StoryBar/storyviewer.jsx";
import CreateStory from "../components/StoryBar/createstory.jsx";
import StoryPreview from "../components/StoryBar/storypreview.jsx";
import UserProfileVideoPost from "../pages/Profile/UserProfileVideoPost.jsx";
import ExploreReels from "../pages/Explore/ExploreReels.jsx";

// Same pattern Messages.jsx / Profile.jsx already use to read the
// logged-in user out of localStorage.
const getCurrentUser = () => {
  try { return JSON.parse(localStorage.getItem("user")); }
  catch { return null; }
};

// Layout route: wraps every "logged-in" route below in CallProvider so
// the incoming-call socket listeners are live on Home, Explore, someone
// else's Profile, Settings, etc.
//
// NOTE: GroupCallProvider has been REMOVED — group audio/video calling is
// no longer part of this app. If you still have
// components/context/GroupCallContext.jsx and components/call/groupcall.jsx
// in your project, they are now unused and safe to delete. GroupChatWindow.jsx
// no longer imports or calls useGroupCall()/startGroupCall() at all.
function CallAwareLayout() {
  const currentUser = getCurrentUser();
  return (
    <CallProvider currentUser={currentUser}>
      <Outlet />
    </CallProvider>
  );
}

function Routespage() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Auth routes — no CallProvider needed, there's no logged-in
            user yet on any of these screens ── */}
        <Route path="/" element={<AuthPage/>}/>
        <Route path="/login" element={<Loginform/>}/>
        <Route path="/registeruser" element={<RegisterForm/>}/>
        <Route path="/verify-email" element={<EmailVerifyPage />} />
        <Route path="/verify-otp" element={<OtpVerifyPage />} />
        <Route path="/forgotpassword" element={<ForgotPassword />} />
        <Route path="/otpverify" element={<OtpVerify />} />
        <Route path="/resetpassword" element={<ResetPassword />} />

        {/* ── Navbar → Settings routes — all nested under the layout
            route so CallProvider is mounted above every one of them ── */}
        <Route element={<CallAwareLayout />}>
          {/* navbar */}
          <Route path="/home"        element={<Homepage />} />
          <Route path="/search"  element={<Explore />} />
          <Route path="/notifications" element={<ActivityPage/>}/>
          <Route path="/messages" element={<Messages/>}/>
          <Route path="/messages/:userId" element={<Messages />} />
          <Route path="/videopage" element={<VideoPage/>}/>
          {/* Profile */}
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/profile"         element={<Profilepage />} />
          <Route path="/editprofile"     element={<EditProfile />} />
          <Route path="/profile/:userId" element={<UserProfileView />} />
          <Route path="/profile-reel/:videoId" element={<UserProfileVideoPost />} />
          <Route path="/explore-reels/:videoId" element={<ExploreReels />} />
          {/* Posts */}
          <Route path="/post/:id" element={<Post />} />
          <Route path="/create-text"   element={<CreateTextPost/>}/>
          <Route path="edit-image" element ={<EditImagePage/>}/>
          <Route path="/create-image" element={<CreateImagePost/>}/>
          <Route path="/create-video" element={<CreateVideoPost/>}/>
          <Route path="/reel/:id" element={<Reelspage />} />
          <Route path="/text-post/:id" element={<TextPostView />}/>
          <Route path="/video-post/:id" element={<Videopost />} />
          <Route path="/story/:id" element={<StoryViewer />} />
          <Route path="/create-story" element={<CreateStory />} />
          <Route path="/story-preview" element={<StoryPreview />} />
          {/* Settings */}
          <Route path="/settings"        element={<Settings />} />
          <Route path="/delete-account"  element={<DeleteAccount />} />
          <Route path="/changepassword"  element={<ChangePassword />} />
          <Route path="/privacy"         element={<PrivacyToggle />} />
          <Route path="/notification"    element={<NotificationSettings />} />
          <Route path="/blocked"         element={<BlockedAccounts />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
};
export default Routespage;