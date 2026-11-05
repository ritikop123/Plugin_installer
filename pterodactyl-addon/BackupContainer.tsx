import AutoBackupButton from '@/components/server/backups/AutoBackupButton';
import GoogleDriveBackupButton from '@/components/server/backups/GoogleDriveBackupButton';
import React, { useContext, useEffect, useState } from 'react';
import Spinner from '@/components/elements/Spinner';
import useFlash from '@/plugins/useFlash';
import Can from '@/components/elements/Can';
import CreateBackupButton from '@/components/server/backups/CreateBackupButton';
import FlashMessageRender from '@/components/FlashMessageRender';
import BackupRow from '@/components/server/backups/BackupRow';
import tw from 'twin.macro';
import getServerBackups, { Context as ServerBackupContext } from '@/api/swr/getServerBackups';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Pagination from '@/components/elements/Pagination';
import { ArchiveIcon } from '@heroicons/react/outline';
import { useTranslation } from 'react-i18next';
import ItemList, { ItemRow, ItemCell } from '@/components/elements/ItemList';

const BackupContainer = () => {
    const { t } = useTranslation('arix/server/backups');
    const { page, setPage } = useContext(ServerBackupContext);
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const { data: backups, error, isValidating } = getServerBackups();

    const backupLimit = ServerContext.useStoreState((state) => state.server.data!.featureLimits.backups);

    useEffect(() => {
        if (!error) {
            clearFlashes('backups');

            return;
        }

        clearAndAddHttpError({ error, key: 'backups' });
    }, [error]);

    if (!backups || (error && isValidating)) {
        return <Spinner size={'large'} centered />;
    }

    return (
        <ServerContentBlock title={t('backups')} icon={ArchiveIcon}>
            <div className={'flex justify-end mb-3 -mt-1'}>
                <GoogleDriveBackupButton />
            </div>

            <FlashMessageRender byKey={'backups'} css={tw`mb-4`} />
            <ItemList
                title={
                    <div className={'flex lg:flex-row flex-col gap-2 items-start justify-between'}>
                        <div>
                            <p className={'text-medium text-gray-300'}>{t('manage-backups')}</p>
                            {backupLimit > 0 && backups.backupCount > 0 && (
                                <p css={tw`text-sm text-neutral-300 mt-1`}>
                                    {t('have-been-allocated', { current: backups.backupCount, max: backupLimit })}
                                </p>
                            )}
                        </div>
                        <Can action={'backup.create'}>
                            <div className={'inline-flex items-center gap-2'}>
                                <AutoBackupButton />
                                {backupLimit > 0 && backupLimit > backups.backupCount && (
                                    <CreateBackupButton css={tw`w-full sm:w-auto`} />
                                )}
                            </div>
                        </Can>
                    </div>
                }
                headers={
                    <tr>
                        <th>{t('name')}</th>
                        <th>{t('size')}</th>
                        <th>{t('creation-date')}</th>
                        <th>{t('checksum')}</th>
                        <th></th>
                    </tr>
                }
            >
                {backupLimit === 0 && (
                    <ItemRow>
                        <ItemCell colSpan={5} className={`text-center text-sm`}>
                            {t('limit-is-0')}
                        </ItemCell>
                    </ItemRow>
                )}
                <Pagination data={backups} onPageSelect={setPage}>
                    {({ items }) =>
                        !items.length ? (
                            // Don't show any error messages if the server has no backups and the user cannot
                            // create additional ones for the server.
                            !backupLimit ? null : (
                                <ItemRow>
                                    <ItemCell colSpan={5} className={`text-center text-sm`}>
                                        {page > 1 ? t('try-going-back') : t('no-backups')}
                                    </ItemCell>
                                </ItemRow>
                            )
                        ) : (
                            items.map((backup, index) => (
                                <BackupRow key={backup.uuid} backup={backup} css={index > 0 ? tw`mt-2` : undefined} />
                            ))
                        )
                    }
                </Pagination>
            </ItemList>
        </ServerContentBlock>
    );
};

export default () => {
    const [page, setPage] = useState<number>(1);
    return (
        <ServerBackupContext.Provider value={{ page, setPage }}>
            <BackupContainer />
        </ServerBackupContext.Provider>
    );
};
