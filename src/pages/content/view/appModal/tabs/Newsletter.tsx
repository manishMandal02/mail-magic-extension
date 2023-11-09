import { useEffect, useState } from 'react';
import { Spinner } from '../../elements/Spinner';
import { Checkbox } from '../../elements/Checkbox';
import { IMessageEvent, IMessageBody, IActionInProgress, EmailAction } from '../../../types/content.types';
import { storageKeys } from '../../../constants/app.constants';
import { asyncHandler } from '@src/pages/content/utils/asyncHandler';
import {
  handleDeleteAllMailsAction,
  handleUnsubscribeAction,
  handleUnsubscribeAndDeleteAction,
  handleWhitelistAction,
} from '@src/pages/content/utils/emailActions';
import { showConfirmModal } from '../../elements/confirmModal';
import { getLocalStorageByKey } from '@src/pages/content/utils/getStorageByKey';
import { limitCharLength } from '@src/pages/content/utils/limitCharLength';
import ActionButton from '../../elements/action-button';
import wait from '@src/pages/content/utils/wait';

type NewsletterData = {
  email: string;
  name: string;
};

const getNewsletterEmailsData = async (shouldRefreshData = false) => {
  try {
    let newsletterEmails: NewsletterData[] = [];
    const getNewsletterEmailsFromBackground = async () => {
      // send message to background to get data
      newsletterEmails = await chrome.runtime.sendMessage<IMessageBody>({
        event: IMessageEvent.GET_NEWSLETTER_EMAILS,
      });

      // save newsletter data to chrome local storage
      await chrome.storage.local.set({ [storageKeys.NEWSLETTER_EMAILS]: newsletterEmails });
    };

    if (shouldRefreshData) {
      await getNewsletterEmailsFromBackground();
    } else {
      //T check if the newsletter emails data is already stored in chrome.storage.local
      // get local storage data
      const storageData = await getLocalStorageByKey<NewsletterData[]>(storageKeys.NEWSLETTER_EMAILS);

      // check if newsletters data already exists
      if (storageData.length > 0) {
        // data already exists, use it
        newsletterEmails = storageData;
      } else {
        // data doesn't exist, fetch from background script
        await getNewsletterEmailsFromBackground();
      }
    }

    return newsletterEmails;
  } catch (error) {
    console.log('🚀 ~ file: Newsletter.tsx:35 ~ getNewsletterEmailsData ~ error:', error);
    return null;
  }
};

export const Newsletter = () => {
  // newsletter emails
  const [newsletterEmails, setNewsletterEmails] = useState<NewsletterData[]>([]);
  // selected emails
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  // loading state
  const [isFetchingNewsletterEmails, setIsFetchingNewsletterEmails] = useState(false);
  // error state for data fetching
  const [errorMsg, setErrorMsg] = useState('');

  // email actions states
  // current email/emails that are being unsubscribed, deleted, whitelisted, etc.
  const [actionInProgressFor, setEmailActionsInProgressFor] = useState<IActionInProgress | null>(null);

  // get newsletter emails data
  useEffect(() => {
    (async () => {
      setIsFetchingNewsletterEmails(true);
      const data = await getNewsletterEmailsData();

      if (!data) setErrorMsg('❌ Failed to fetch newsletter emails');

      setNewsletterEmails(data);
      setIsFetchingNewsletterEmails(false);
    })();
  }, []);

  // handle refresh table/data
  const refreshTable = async () => {
    // reset state
    setEmailActionsInProgressFor(null);
    setSelectedEmails([]);

    // refresh/refetch newsletter data if current data is below 60
    const shouldRefreshData = newsletterEmails.length - selectedEmails.length < 60;

    if (shouldRefreshData) {
      // show loading spinner only if refetching data from gmail (as it could take some time)
      setIsFetchingNewsletterEmails(true);
    }

    const data = await getNewsletterEmailsData(shouldRefreshData);

    console.log('🚀 ~ file: Newsletter.tsx:147 ~ refreshTable ~ data:', data);

    // hide loading spinner
    if (isFetchingNewsletterEmails) setIsFetchingNewsletterEmails(false);

    // set data
    if (data && data.length > 0) {
      setNewsletterEmails(data);
    }
  };

  // email action
  useEffect(
    asyncHandler(async () => {
      // do nothing if no action in progress
      if (!actionInProgressFor || actionInProgressFor.emails.length < 1) return;

      console.log('🚀 ~ file: Newsletter.tsx:162 ~ asyncHandler ~ actionInProgressFor:', actionInProgressFor);

      // handle email actions
      if (actionInProgressFor.action === 'unsubscribe') {
        await handleUnsubscribeAction({ emails: actionInProgressFor.emails, isWhitelisted: false });
        await refreshTable();
        return;
      }
      if (actionInProgressFor.action === 'deleteAllMails') {
        await handleDeleteAllMailsAction({
          emails: actionInProgressFor.emails,
          onSuccess: async () => {
            await refreshTable();
          },
        });
        return;
      }
      if (actionInProgressFor.action === 'unsubscribeAndDeeAllMails') {
        await handleUnsubscribeAndDeleteAction({
          emails: actionInProgressFor.emails,
          isWhitelisted: false,
          onSuccess: async () => {
            await refreshTable();
          },
        });
        return;
      }
      if (actionInProgressFor.action === 'whitelistEmail') {
        await handleWhitelistAction({ emails: actionInProgressFor.emails });
        await refreshTable();
        return;
      }
    }),
    [actionInProgressFor]
  );

  // render newsletter table
  const renderTable = () => {
    // action buttons for each email
    const actionButtons = (email: string) => (
      <>
        <ActionButton
          action={EmailAction.whitelistEmail}
          tooltipLabel='Keep/Whitelist'
          onClick={() => setEmailActionsInProgressFor({ emails: [email], action: 'whitelistEmail' })}
          isDisabled={selectedEmails.length > 0 || actionInProgressFor?.emails.length > 1}
        />

        <ActionButton
          action={EmailAction.unsubscribe}
          tooltipLabel='Unsubscribe'
          onClick={() => setEmailActionsInProgressFor({ emails: [email], action: 'unsubscribe' })}
          isDisabled={selectedEmails.length > 0 || actionInProgressFor?.emails.length > 1}
        />

        <ActionButton
          action={EmailAction.deleteAllMails}
          tooltipLabel='Delete all mails'
          onClick={async () =>
            await showConfirmModal({
              email,
              msg: 'Are you sure you want to delete all mails from',
              onConfirmClick: async () => {
                setEmailActionsInProgressFor({ emails: [email], action: 'deleteAllMails' });
              },
            })
          }
          isDisabled={selectedEmails.length > 0 || actionInProgressFor?.emails.length > 1}
        />
        <ActionButton
          action={EmailAction.unsubscribeAndDeeAllMails}
          tooltipLabel='Unsubscribe & Delete all'
          onClick={async () =>
            await showConfirmModal({
              email,
              msg: 'Are you sure you want to delete all mails and unsubscribe from',
              onConfirmClick: async () => {
                setEmailActionsInProgressFor({ emails: [email], action: 'unsubscribeAndDeeAllMails' });
              },
            })
          }
          isDisabled={selectedEmails.length > 0 || actionInProgressFor?.emails.length > 1}
        />
      </>
    );

    // render action buttons or spinner based on loading state
    const renderActionButtons = (email: string) => {
      if (
        selectedEmails.length < 1 &&
        actionInProgressFor?.emails.length === 1 &&
        actionInProgressFor?.emails.includes(email)
      ) {
        // render loading spinner if a action is in progress for this email
        return <Spinner size='sm' />;
      }

      return actionButtons(email);
    };

    return newsletterEmails.length > 0 ? (
      <>
        {/* emails table */}
        {/* table container */}
        <div className='w-full  h-[90%] overflow-x-hidden overflow-y-auto z-20'>
          <table className='w-full h-full bg-slate-50 relative  z-30'>
            {/* table header */}
            <tr className='w-full sticky top-0 left-0 text-sm font-medium text-slate-600 bg-slate-200 flex items-center justify-between px-4 py-1.5 z-20'>
              <td className='w-[5%]'>
                <Checkbox
                  isChecked={selectedEmails.length === newsletterEmails.length}
                  onChange={isChecked => {
                    if (!isChecked) {
                      // handle deselect all
                      setSelectedEmails([]);
                      return;
                    }

                    // handle select all
                    setSelectedEmails([...newsletterEmails.map(email => email.email)]);
                  }}
                />{' '}
              </td>
              <td className='w-[5%]'>#</td>
              <td className='w-[30%] ml-1'>Name</td>
              <td className='w-[30%] ml-1'>Email</td>
              <td className='w-[30%] text-center pr-4'>Action </td>
            </tr>
            {newsletterEmails.map(({ email, name }, idx) => (
              <tr
                key={email + name}
                className='w-full flex items-center  justify-between px-4 odd:bg-slate-100 py-1.5 hover:bg-slate-200/60 transition-all duration-150 z-20'
              >
                <td className='w-[5%]'>
                  <Checkbox
                    isChecked={selectedEmails.includes(email)}
                    onChange={isChecked => {
                      if (!isChecked) {
                        // unchecked, remove the email from the list
                        setSelectedEmails(prevEmails => prevEmails.filter(e => e !== email));
                        return;
                      }

                      // checked, add the email to the list
                      setSelectedEmails(prevEmails => [...prevEmails, email]);
                    }}
                  />
                </td>
                <td className='text-sm w-[5%]'>{idx + 1}.</td>
                <td className='text-sm ml-1 w-[30%]'>
                  {limitCharLength(name.replaceAll(`\\`, '').trim(), 22)}
                </td>
                <td className='text-sm w-[30%]'>{limitCharLength(email, 32)}</td>
                <td className='text-sm w-[30%] flex items-center justify-evenly  pr-4'>
                  {/* render action button or loading spinner (if action in progress) */}
                  {renderActionButtons(email)}
                </td>
              </tr>
            ))}
            {/* refresh table button */}
            <tr>
              <td colSpan={5} className='w-full flex justify-center items-center'></td>
            </tr>
          </table>
        </div>

        {/* selected emails */}
        <div className='h-[10%] w-full overflow-hidden z-50 max-w-full bg-slate-200 border-t border-slate-500/50'>
          <div className='px-4 w-full h-full flex justify-between items-center'>
            {selectedEmails.length < 1 ? (
              // no email selected
              <span className='text-xs text-slate-600 font-extralight'>
                Select multiple emails to perform bulk actions or click on action button for individual email
                actions
              </span>
            ) : (
              <>
                {/* email selected  */}
                <span className='text-sm text-slate-600 font-extralight w-[75%]'>
                  {selectedEmails.length}{' '}
                  {selectedEmails.length > 1 ? 'Emails' : `Email (${selectedEmails[0]})`} selected
                </span>
                {/*  email action  */}
                <div className='mr-10 w-[25%]  '>
                  {actionInProgressFor?.emails.length > 0 ? (
                    // show loading spinner if action in progress
                    <Spinner size='sm' />
                  ) : (
                    // show possible actions for selected emails
                    <div className='flex items-centers justify-between min-w-fit z-50'>
                      <ActionButton
                        action={EmailAction.whitelistEmail}
                        tooltipLabel='Keep/Whitelist'
                        onClick={() =>
                          setEmailActionsInProgressFor({
                            emails: [...selectedEmails],
                            action: 'whitelistEmail',
                          })
                        }
                      />
                      <ActionButton
                        action={EmailAction.unsubscribe}
                        tooltipLabel='Unsubscribe'
                        onClick={() =>
                          setEmailActionsInProgressFor({
                            emails: [...selectedEmails],
                            action: 'unsubscribe',
                          })
                        }
                      />

                      <ActionButton
                        action={EmailAction.deleteAllMails}
                        tooltipLabel='Delete all mails'
                        onClick={() =>
                          setEmailActionsInProgressFor({
                            emails: [...selectedEmails],
                            action: 'deleteAllMails',
                          })
                        }
                      />
                      <ActionButton
                        action={EmailAction.unsubscribeAndDeeAllMails}
                        tooltipLabel='Unsubscribe & Delete all'
                        onClick={() =>
                          setEmailActionsInProgressFor({
                            emails: [...selectedEmails],
                            action: 'unsubscribeAndDeeAllMails',
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </>
    ) : (
      <div className='text-slate-800 w-full text-center font-light'>
        📭 No Newsletter or mailing list emails found in your Inbox.
        <br />
        <p className='ml-2 mt-3 opacity-60 font-extralight text-sm'>
          {' '}
          Emails already unsubscribed by Fresh Inbox won't be visible here.
        </p>
      </div>
    );
  };

  return (
    <div className='w-full h-full max-h-full'>
      <p className='h-[5%] m-0 text-slate-700 mb-[.4rem] font-light text-sm flex items-center justify-center'>
        Fresh Inbox has identified
        <u className='mx-1'>
          {newsletterEmails.length}
          {/* show + if more than 100 emails */}
          <strong>{newsletterEmails.length > 100 ? '+' : null}</strong>
        </u>
        emails as newsletters or as part of a mailing list.
      </p>

      <div className='h-px w-full bg-slate-300'></div>

      {/* bottom container */}
      <div className='w-full h-[95%] flex flex-col justify-center items-start'>
        {/* render table after loading or show error msg if failed */}
        {isFetchingNewsletterEmails ? (
          <Spinner size='lg' />
        ) : !errorMsg ? (
          renderTable()
        ) : (
          <p className='text-red-400 bg-red-100/75 px-8  py-2 text font-light '>{errorMsg}</p>
        )}
      </div>
    </div>
  );
};
