import tw from 'twin.macro';
import { ServerContext } from '@/state/server';
import React, { useState, useEffect } from 'react';
import Spinner from '@/components/elements/Spinner';
import { CSSTransition } from 'react-transition-group';
import Pagination from '@/components/elements/Pagination';
import FlashMessageRender from '@/components/FlashMessageRender';
import { fetchPlugins } from '@/blueprint/extensions/{identifier}/api/getPlugins';
import PluginCard from '@/blueprint/extensions/{identifier}/PluginCard';
import { SearchRow } from '@/blueprint/extensions/{identifier}/SearchRow';
import ServerContentBlock from '@/components/elements/ServerContentBlock';

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const [provider, setProvider] = useState('modrinth');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(48);
    const [searchQuery, setSearchQuery] = useState('');
    const [loader, setLoader] = useState('paper');
    const [sortBy, setSortBy] = useState('downloads');
    const [minecraftVersion, setMinecraftVersion] = useState('');

    useEffect(() => {
        const defaultSorts: { [key: string]: string } = {
            modrinth: 'downloads',
            curseforge: '6',
            hangar: '-downloads',
            spigotmc: '-downloads',
            polymart: 'downloads',
        };

        if (defaultSorts[provider]) {
            setSortBy(defaultSorts[provider]);
        }
    }, [provider]);

    const { plugins, pagination, loading, error } = fetchPlugins(
        uuid,
        provider,
        page,
        pageSize,
        searchQuery,
        loader,
        sortBy,
        minecraftVersion
    );

    useEffect(() => {
        setPage(1);
    }, [pageSize, provider]);

    const handleSearch = (query: string) => {
        setSearchQuery(query);
        setPage(1);
    };

    const handlePageSelect = (selectedPage: number) => {
        setPage(selectedPage);
    };

    const [textInstallButton, setTextInstallButton] = useState('Install');
    const [textVersionsButton, setTextVersionsButton] = useState('Versions');
    const [textDownloadButton, setTextDownloadButton] = useState('Download');
    const [textSearch, setTextSearch] = useState('Search');
    const [textSearchBox, setTextSearchBox] = useState('Search plugins...');
    const [textVersion, setTextVersion] = useState('Versions');
    const [textLoader, setTextLoader] = useState('Server Loaders');
    const [textSortBy, setTextSortBy] = useState('Sort By');
    const [textProvider, setTextProvider] = useState('Providers');
    const [textPageSize, setTextPageSize] = useState('Size');
    const [textNotFound, setTextNotFound] = useState('No plugins were found.');
    const [textShowing, setTextShowing] = useState('Showing %_PLUGINS_% out of %_TOTAL_PLUGINS_% plugins.');
    const [textVersionList, setTextVersionList] = useState('Available Versions for %_PLUGIN_NAME_%');
    const [textVersionsNotFound, setTextVersionsNotFound] = useState('No versions of this plugin were found.');
    const [textVersionDownloads, setTextVersionDownloads] = useState('%_VERSION_DOWNLOADS_% downloads');
    const [textRedirectUrl, setTextRedirectUrl] = useState("View the plugin's official page in a new tab.");
    const [textDownloadUrl, setTextDownloadUrl] = useState(
        'This plugin is only available for download on its official website.'
    );
    const [textInstallSuccess, setTextInstallSuccess] = useState(
        'The plugin %_PLUGIN_NAME_% has been successfully installed in your Plugins folder.'
    );
    const [textInstallFailed, setTextInstallFailed] = useState(
        'We were not able to install the plugin %_PLUGIN_NAME_%. However, you can still download this plugin from its official website.'
    );

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await fetch(`/api/client/extensions/{identifier}/servers/${uuid}/settings`);
                const data = await response.json();

                if (data) {
                    if (data.default_page_size !== null) setPageSize(data.default_page_size);
                    if (data.default_provider !== null) setProvider(data.default_provider);
                    if (data.text_install_button !== null) setTextInstallButton(data.text_install_button);
                    if (data.text_versions_button !== null) setTextVersionsButton(data.text_versions_button);
                    if (data.text_download_button !== null) setTextDownloadButton(data.text_download_button);
                    if (data.text_search !== null) setTextSearch(data.text_search);
                    if (data.text_search_box !== null) setTextSearchBox(data.text_search_box);
                    if (data.text_version !== null) setTextVersion(data.text_version);
                    if (data.text_loader !== null) setTextLoader(data.text_loader);
                    if (data.text_sort_by !== null) setTextSortBy(data.text_sort_by);
                    if (data.text_provider !== null) setTextProvider(data.text_provider);
                    if (data.text_page_size !== null) setTextPageSize(data.text_page_size);
                    if (data.text_not_found !== null) setTextNotFound(data.text_not_found);
                    if (data.text_showing !== null) setTextShowing(data.text_showing);
                    if (data.text_version_list !== null) setTextVersionList(data.text_version_list);
                    if (data.text_versions_not_found !== null) setTextVersionsNotFound(data.text_versions_not_found);
                    if (data.text_version_downloads !== null) setTextVersionDownloads(data.text_version_downloads);
                    if (data.text_redirect_url !== null) setTextRedirectUrl(data.text_redirect_url);
                    if (data.text_download_url !== null) setTextDownloadUrl(data.text_download_url);
                    if (data.text_install_success !== null) setTextInstallSuccess(data.text_install_success);
                    if (data.text_install_failed !== null) setTextInstallFailed(data.text_install_failed);
                }
            } catch (error) {
                console.error('Error fetching settings:', error);
            }
        };

        fetchSettings();
    }, [uuid]);

    const renderShowingText = () => {
        if (!pagination) return '';
        return textShowing
            .replace('%_PLUGINS_%', plugins?.length.toString() || '0')
            .replace('%_TOTAL_PLUGINS_%', pagination.total.toString());
    };

    return (
        <ServerContentBlock title={'Plugin Manager'}>
            <SearchRow
                onSearch={handleSearch}
                minecraftVersion={minecraftVersion}
                setMinecraftVersion={setMinecraftVersion}
                provider={provider}
                setProvider={setProvider}
                sortBy={sortBy}
                setSortBy={setSortBy}
                loader={loader}
                setLoader={setLoader}
                pageSize={pageSize}
                setPageSize={setPageSize}
                textSearch={textSearch}
                textSearchBox={textSearchBox}
                textVersion={textVersion}
                textLoader={textLoader}
                textSortBy={textSortBy}
                textProvider={textProvider}
                textPageSize={textPageSize}
            />
            <FlashMessageRender byKey={'{identifier}:install'} css={tw`mt-6`} />
            {loading ? (
                <div css={tw`w-full flex justify-center mt-6`}>
                    <Spinner size='large' />
                </div>
            ) : error || (plugins && plugins.length === 0) ? (
                <div css={tw`mt-6`}>{textNotFound}</div>
            ) : (
                <CSSTransition classNames={'fade'} timeout={150} appear in>
                    <Pagination
                        data={{ items: plugins || [], pagination: pagination! }}
                        onPageSelect={handlePageSelect}
                    >
                        {({ items }) => (
                            <div>
                                <div css={tw`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6`}>
                                    {items.map((plugin) => (
                                        <PluginCard
                                            key={plugin.id}
                                            plugin={plugin}
                                            textInstallButton={textInstallButton}
                                            textVersionsButton={textVersionsButton}
                                            textRedirectUrl={textRedirectUrl}
                                            textDownloadUrl={textDownloadUrl}
                                            textInstallSuccess={textInstallSuccess}
                                            textInstallFailed={textInstallFailed}
                                            textSearch={textSearch}
                                            textSearchBox={textSearchBox}
                                            textVersion={textVersion}
                                            textLoader={textLoader}
                                            textVersionList={textVersionList}
                                            textVersionsNotFound={textVersionsNotFound}
                                            textVersionDownloads={textVersionDownloads}
                                            textDownloadButton={textDownloadButton}
                                        />
                                    ))}
                                </div>
                                <div css={tw`w-full flex justify-center my-4 text-sm`}>
                                    {provider !== 'spigotmc' && <div>{renderShowingText()}</div>}
                                </div>
                            </div>
                        )}
                    </Pagination>
                </CSSTransition>
            )}
        </ServerContentBlock>
    );
};
