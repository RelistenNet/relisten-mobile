import AsyncStorage from '@react-native-async-storage/async-storage';

const PRESENTED_KEY_PREFIX = 'relisten.account.initial-username-review.v1';

/**
 * `usernameReviewNeeded` remains true when a listener keeps the assigned username for now.
 * This installation marker distinguishes the first post-sign-in presentation from the
 * reminder card, including when the app is relaunched into a cold OAuth callback.
 */
export async function claimInitialUsernameReviewPresentation(userUuid: string) {
  const key = `${PRESENTED_KEY_PREFIX}.${userUuid}`;

  try {
    if (await AsyncStorage.getItem(key)) {
      return false;
    }

    await AsyncStorage.setItem(key, 'presented');
    return true;
  } catch {
    // If device storage is temporarily unavailable, showing the review is safer than losing
    // the only automatic presentation. The in-memory caller still prevents a render loop.
    return true;
  }
}
